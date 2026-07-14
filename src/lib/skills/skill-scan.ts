// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * SKILL.md safety scan (Stage C, Lock 1 — ADR-0003).
 *
 * Skills are third-party instruction files an agent ingests as authority. The
 * same discipline the recipe scanner applies to YAML recipes applies here to
 * SKILL.md (markdown + YAML frontmatter): run the invisible-char {@link sanitize}
 * over the RAW text BEFORE anything reads it, enumerate the declared surface from
 * the parsed frontmatter, and — beyond the recipe path — DECODE candidate
 * base64/hex blobs and re-scan the decoded content, so a payload hidden inside an
 * encoding cannot slip past a surface-only scan.
 *
 * Honesty boundary (ADR-0003): signature/character scanning CANNOT catch a skill
 * that instructs harm in plain, visible language. Lock 1 closes the obfuscated
 * and encoded channels; consent (Lock 2) and active-skill visibility (Lock 3)
 * carry the rest. Pure, deterministic, dependency-free, zero LLM inference.
 */

import { sanitize, hasWarnings, type Finding } from '../security/invisible-chars';
import { parseFrontmatter } from '../frontmatter';

/** A base64/hex blob that decoded to content carrying hidden characters. */
export interface DecodeFinding {
  /** 'base64' | 'hex' — how the blob was encoded. */
  encoding: 'base64' | 'hex';
  /** UTF-16 offset of the blob in the raw text. */
  offset: number;
  /** The high-severity findings inside the decoded content. */
  hidden: Finding[];
  /** A short, safe preview of the decoded text (control chars shown as ·). */
  decodedPreview: string;
}

export interface SkillScan {
  /** Optional source path (for registry / display). */
  path?: string;
  /** Post-strip content (STRIP set removed; WARN chars retained + flagged). */
  cleanText: string;
  /** Char-level findings over the raw skill text. */
  findings: Finding[];
  /** Encoded-payload findings (decode-before-match). */
  decodeFindings: DecodeFinding[];
  /** Declared skill name (frontmatter `name`), or undefined. */
  name?: string;
  /** Declared description (frontmatter `description`), or undefined. */
  description?: string;
  /** Declared license (frontmatter `license`), or undefined. */
  license?: string;
  /** Declared tool/permission grants (frontmatter `allowed-tools`), if any. */
  declaredTools: string[];
  /** Declared directory grants (frontmatter `allowed-directories`), if any. */
  declaredDirectories: string[];
  /** Whether an instruction body (markdown after frontmatter) is present. */
  bodyPresent: boolean;
  /** Set when the file has no parseable frontmatter (skills require it). */
  frontmatterError?: string;
}

// --- decode-before-match -----------------------------------------------------

/** Show decoded text safely: printable ASCII kept, everything else as `·`. */
function safePreview(s: string, max = 80): string {
  const shown = Array.from(s.slice(0, max))
    .map((ch) => {
      const cp = ch.codePointAt(0) as number;
      return cp >= 0x20 && cp <= 0x7e ? ch : '·';
    })
    .join('');
  return s.length > max ? `${shown}…` : shown;
}

function decodeBase64(blob: string): string | null {
  try {
    const bin = atob(blob.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

function decodeHex(blob: string): string | null {
  const hex = blob.replace(/\s+/g, '');
  if (hex.length % 2 !== 0) return null;
  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

// Length thresholds bound how many blobs we bother decoding; they are NOT the
// safety control — a blob is only ever FLAGGED when its decoded form contains a
// high-severity hidden character, so a low threshold adds decode attempts, not
// false positives. 16 base64 chars ≈ 12 bytes / 16 hex chars = 8 bytes.
const B64_RE = /[A-Za-z0-9+/]{16,}={0,2}/g;
const HEX_RE = /(?:[0-9a-fA-F]{2}){8,}/g;

/**
 * Find base64/hex blobs in the raw text, decode them, and re-run the sanitizer on
 * the decoded content. A blob is flagged ONLY when its decoded form contains a
 * high-severity hidden character (Tags block / bidi / variation selector) — so a
 * legitimate base64 asset (which decodes to noise, not hidden text) does not
 * false-positive. This is the "decode-before-match" guard.
 */
export function scanEncodedPayloads(raw: string): DecodeFinding[] {
  const out: DecodeFinding[] = [];
  const check = (encoding: 'base64' | 'hex', re: RegExp, decode: (b: string) => string | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const decoded = decode(m[0]);
      if (decoded === null || decoded.length === 0) continue;
      const { findings } = sanitize(decoded);
      const hidden = findings.filter((f) => f.severity === 'warning');
      if (hidden.length > 0) {
        out.push({ encoding, offset: m.index, hidden, decodedPreview: safePreview(decoded) });
      }
    }
  };
  check('base64', B64_RE, decodeBase64);
  check('hex', HEX_RE, decodeHex);
  return out;
}

// --- the scan ----------------------------------------------------------------

function propValue(
  props: { key: string; value: string | string[] | boolean | number | null }[],
  key: string,
): string | string[] | undefined {
  const p = props.find((x) => x.key.toLowerCase() === key.toLowerCase());
  if (!p || p.value === null) return undefined;
  if (typeof p.value === 'string' || Array.isArray(p.value)) return p.value;
  return String(p.value);
}

function asList(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

/** Scan a SKILL.md's raw text: sanitize, parse frontmatter, decode-before-match. */
export function scanSkill(raw: string, path?: string): SkillScan {
  const { clean, findings } = sanitize(raw);
  const decodeFindings = scanEncodedPayloads(raw);

  const fm = parseFrontmatter(clean);
  const scan: SkillScan = {
    path,
    cleanText: clean,
    findings,
    decodeFindings,
    declaredTools: [],
    declaredDirectories: [],
    bodyPresent: false,
  };

  if (!fm) {
    scan.frontmatterError = 'SKILL.md has no YAML frontmatter — cannot establish skill identity.';
    // The body is whatever follows; treat all non-empty content as body.
    scan.bodyPresent = clean.trim().length > 0;
    return scan;
  }

  const name = propValue(fm.properties, 'name');
  const description = propValue(fm.properties, 'description');
  const license = propValue(fm.properties, 'license');
  scan.name = typeof name === 'string' ? name : undefined;
  scan.description = typeof description === 'string' ? description : undefined;
  scan.license = typeof license === 'string' ? license : undefined;
  scan.declaredTools = asList(propValue(fm.properties, 'allowed-tools'));
  scan.declaredDirectories = asList(propValue(fm.properties, 'allowed-directories'));

  const bodyLines = clean.split('\n').slice(fm.endLine + 1);
  scan.bodyPresent = bodyLines.join('\n').trim().length > 0;

  return scan;
}

// --- gating ------------------------------------------------------------------

/** True if anything must block a silent install: a high-severity hidden char, an
 *  encoded hidden payload, or missing frontmatter (no verifiable identity). */
export function skillScanHasWarnings(scan: SkillScan): boolean {
  return (
    hasWarnings(scan.findings) ||
    scan.decodeFindings.length > 0 ||
    scan.frontmatterError !== undefined
  );
}

/** Fully-clean skill content for use (STRIP + WARN both removed) — only after
 *  explicit consent (Lock 2). */
export function fullyCleanSkill(raw: string): string {
  return sanitize(raw, { stripWarnings: true }).clean;
}

// --- consent model (Lock 2) --------------------------------------------------

/** A coarse trust signal for the source of a skill (e.g. Skillsmith tier). */
export type TrustTier = 'unknown' | 'community' | 'verified' | 'first-party';

export interface SkillConsentModel {
  name: string;
  description?: string;
  license?: string;
  trust: TrustTier;
  /** The declared surface, as human-readable action lines. */
  actions: { label: string; detail?: string }[];
  /** Routine notices (e.g. "3 invisible chars stripped") — proceed on plain consent. */
  notices: string[];
  /** High-severity warnings — each must be EXPLICITLY acknowledged. */
  warnings: { id: string; label: string; detail?: string }[];
  /** A rendered, sanitized excerpt of the instruction body for the human to read. */
  bodyExcerpt: string;
}

/**
 * Build the install-time consent model (Lock 2) from a scan. Nothing about a skill
 * installs silently: this surfaces the declared surface, the stripped invisibles,
 * every high-severity warning (char + encoded), the trust tier, and a readable
 * excerpt — for an explicit human approval.
 */
export function buildSkillConsent(scan: SkillScan, trust: TrustTier = 'unknown'): SkillConsentModel {
  const actions: { label: string; detail?: string }[] = [];
  for (const t of scan.declaredTools) actions.push({ label: `grants tool: ${t}` });
  for (const d of scan.declaredDirectories) actions.push({ label: `grants directory access: ${d}` });
  if (scan.bodyPresent) actions.push({ label: 'contains instruction body (the agent will read it as authority)' });

  const stripped = scan.findings.filter((f) => f.severity === 'stripped').length;
  const notices: string[] = [];
  if (stripped > 0) notices.push(`${stripped} invisible character(s) stripped from the skill text.`);

  const warnings: { id: string; label: string; detail?: string }[] = [];
  if (scan.frontmatterError) {
    warnings.push({ id: 'no-frontmatter', label: 'No skill identity', detail: scan.frontmatterError });
  }
  for (const f of scan.findings.filter((f) => f.severity === 'warning')) {
    warnings.push({
      id: `char-${f.codepoint.toString(16)}-${f.offset}`,
      label: `Hidden ${f.name}`,
      detail: f.decoded !== undefined ? `smuggled payload: "${f.decoded}"` : `at offset ${f.offset}`,
    });
  }
  for (const d of scan.decodeFindings) {
    warnings.push({
      id: `decode-${d.encoding}-${d.offset}`,
      label: `Hidden characters inside ${d.encoding} content`,
      detail: `decoded preview: "${d.decodedPreview}"`,
    });
  }

  return {
    name: scan.name ?? scan.path ?? 'unnamed skill',
    description: scan.description,
    license: scan.license,
    trust,
    actions,
    notices,
    warnings,
    bodyExcerpt: safePreview(scan.cleanText.trim(), 400),
  };
}
