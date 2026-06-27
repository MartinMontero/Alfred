// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Invisible / deceptive Unicode sanitizer (Pale Fire mitigation).
 *
 * Operation Pale Fire (Jan 2026) weaponized shared goose recipes by smuggling
 * instructions in characters that are invisible to a human but tokenized by an
 * LLM. The doc's exemplars (U+200B/U+200C) are not the whole threat class — the
 * surface includes the full zero-width/invisible-format set, the bidi /
 * Trojan-Source controls, the Unicode **Tags block** (the headline ASCII
 * smuggling vector), and the supplementary variation selectors.
 *
 * Pure, deterministic, dependency-free, **zero LLM inference**. Reusable by any
 * future input sanitizer — this is the single source of truth for the surface.
 *
 * Two severities:
 *  - `stripped`: removed silently. Zero-width / invisible-format chars with no
 *    legitimate purpose in machine input.
 *  - `warning`: flagged loudly, NOT removed by default (the operator must see it).
 *    Bidi/Trojan-Source controls, the Tags block (payload decoded into the
 *    finding), and supplementary variation selectors — none has any legitimate
 *    purpose in a recipe. Removed from `clean` only when `stripWarnings` is set
 *    (e.g. after explicit operator acknowledgement, before execution).
 */

export type Severity = 'stripped' | 'warning';

export interface Finding {
  /** Unicode code point. */
  codepoint: number;
  /** Human-readable name, or `U+XXXX` fallback. */
  name: string;
  severity: Severity;
  /** UTF-16 index of the character in the raw input. */
  offset: number;
  /** For Tags-block chars: the smuggled ASCII character, if printable. */
  decoded?: string;
}

export interface SanitizeResult {
  clean: string;
  findings: Finding[];
}

export interface SanitizeOptions {
  /** Also remove `warning`-severity chars from `clean` (post-acknowledgement). */
  stripWarnings?: boolean;
}

// --- STRIP set: zero-width / invisible-format, silently removed ---------------
const STRIP_NAMES: Record<number, string> = {
  0x00ad: 'SOFT HYPHEN',
  0x034f: 'COMBINING GRAPHEME JOINER',
  0x061c: 'ARABIC LETTER MARK',
  0x115f: 'HANGUL CHOSEONG FILLER',
  0x1160: 'HANGUL JUNGSEONG FILLER',
  0x17b4: 'KHMER VOWEL INHERENT AQ',
  0x17b5: 'KHMER VOWEL INHERENT AA',
  0x180e: 'MONGOLIAN VOWEL SEPARATOR',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x2060: 'WORD JOINER',
  0x2061: 'FUNCTION APPLICATION',
  0x2062: 'INVISIBLE TIMES',
  0x2063: 'INVISIBLE SEPARATOR',
  0x2064: 'INVISIBLE PLUS',
  0x3164: 'HANGUL FILLER',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)',
  0xffa0: 'HALFWIDTH HANGUL FILLER',
};
const STRIP_SET = new Set<number>(Object.keys(STRIP_NAMES).map(Number));

// --- WARN ranges: flagged loudly, no legitimate purpose in a recipe ----------
const BIDI_NAMES: Record<number, string> = {
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',
};

function inRange(cp: number, lo: number, hi: number): boolean {
  return cp >= lo && cp <= hi;
}

/** Classify a code point. Returns its severity, or null if it is allowed.
 *
 * Note: U+FE00–U+FE0F (variation selectors 1–16) are deliberately **allowed** —
 * they are legitimate emoji/CJK presentation selectors. Only the *supplementary*
 * variation selectors (U+E0100–U+E01EF), used for steganographic smuggling, warn. */
function classify(cp: number): Severity | null {
  if (STRIP_SET.has(cp)) return 'stripped';
  if (cp in BIDI_NAMES) return 'warning'; // 202A–202E, 2066–2069
  if (inRange(cp, 0xe0000, 0xe007f)) return 'warning'; // Tags block (ASCII smuggling)
  if (inRange(cp, 0xe0100, 0xe01ef)) return 'warning'; // supplementary variation selectors
  return null;
}

function nameOf(cp: number, severity: Severity): string {
  if (STRIP_NAMES[cp]) return STRIP_NAMES[cp];
  if (BIDI_NAMES[cp]) return BIDI_NAMES[cp];
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  if (inRange(cp, 0xe0000, 0xe007f)) return `${hex} (UNICODE TAG)`;
  if (inRange(cp, 0xe0100, 0xe01ef)) return `${hex} (VARIATION SELECTOR-${cp - 0xe0100 + 17})`;
  return `${hex} (${severity})`;
}

/** Decode a Tags-block char to its smuggled ASCII, if printable. */
function decodeTag(cp: number): string | undefined {
  if (!inRange(cp, 0xe0000, 0xe007f)) return undefined;
  const ascii = cp - 0xe0000; // E0020..E007E map to ASCII 0x20..0x7E
  return ascii >= 0x20 && ascii <= 0x7e ? String.fromCharCode(ascii) : undefined;
}

/**
 * Remove/flag invisible & deceptive characters. `clean` always has the STRIP set
 * removed; `warning` chars are retained in `clean` (and flagged) unless
 * `stripWarnings` is set. Iterates by code point so astral chars (Tags, VS) are
 * handled correctly; `offset` is the UTF-16 index in `raw`.
 */
export function sanitize(raw: string, opts: SanitizeOptions = {}): SanitizeResult {
  const findings: Finding[] = [];
  let clean = '';
  for (let i = 0; i < raw.length; ) {
    const cp = raw.codePointAt(i) as number;
    const width = cp > 0xffff ? 2 : 1;
    const severity = classify(cp);
    if (severity === 'stripped') {
      findings.push({ codepoint: cp, name: nameOf(cp, severity), severity, offset: i });
    } else if (severity === 'warning') {
      const decoded = decodeTag(cp);
      findings.push({
        codepoint: cp,
        name: nameOf(cp, severity),
        severity,
        offset: i,
        ...(decoded !== undefined ? { decoded } : {}),
      });
      if (!opts.stripWarnings) clean += raw.slice(i, i + width);
    } else {
      clean += raw.slice(i, i + width);
    }
    i += width;
  }
  return { clean, findings };
}

/** True if any finding is a high-severity warning (blocks an unacknowledged run). */
export function hasWarnings(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'warning');
}
