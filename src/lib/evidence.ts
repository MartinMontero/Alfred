// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Evidence provenance semantics (triad canon: provenance attaches to notes as
 * frontmatter; findings carry confidence 0–1, validity windows, and
 * non-destructive invalidation labels — never silent deletion).
 *
 * Pure and dependency-free (no @platform, no DOM) so it is unit-testable.
 * Additive/optional: notes without these fields are simply "unmarked". This
 * module is intentionally NOT wired into the load-bearing frontmatter schema
 * (frontmatter-schema.ts); field-name canonization is pending sign-off — see
 * LOOP-DESIGN.md Assumptions.
 *
 * Two-layer rule: the build-workflow vocabulary (EXECUTED / VERIFIED-LIVE /
 * CANON / REPORTED / UNVERIFIED) is for loop reports and must not appear here
 * or in product UI. Product semantics are confidence bands + flags + windows.
 */

export type EvidenceBand = 'high' | 'mid' | 'low' | 'unknown';

export interface EvidenceIssue {
  field: string;
  message: string;
}

export interface EvidenceMeta {
  /** Present iff a syntactically valid confidence (0–1) was supplied. */
  confidence: number | null;
  band: EvidenceBand;
  directional: boolean;
  needsCaveat: boolean;
  /** ISO dates when supplied and well-formed. */
  validFrom: string | null;
  validUntil: string | null;
  /** Non-destructive invalidation: reason string, or '' when flagged bare `true`. */
  invalidated: string | null;
  sources: string[];
  /** True when the note carries no evidence fields at all (render nothing). */
  unmarked: boolean;
  /** Malformed inputs are surfaced, never guessed around. */
  issues: EvidenceIssue[];
}

/** Band thresholds (Assumption 3 in LOOP-DESIGN.md — pending sign-off). */
export const BAND_HIGH_MIN = 0.75;
export const BAND_MID_MIN = 0.4;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const EVIDENCE_FIELDS = [
  'confidence',
  'sources',
  'valid-from',
  'valid-until',
  'directional',
  'needs-caveat',
  'invalidated',
] as const;

export function bandFor(confidence: number | null): EvidenceBand {
  if (confidence === null) return 'unknown';
  if (confidence >= BAND_HIGH_MIN) return 'high';
  if (confidence >= BAND_MID_MIN) return 'mid';
  return 'low';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readBool(v: unknown): boolean {
  return v === true || v === 'true';
}

function readDate(
  fm: Record<string, unknown>,
  field: string,
  issues: EvidenceIssue[],
): string | null {
  const v = fm[field];
  if (v === undefined || v === null || v === '') return null;
  const s = String(v);
  if (ISO_DATE.test(s)) return s;
  issues.push({ field, message: `Expected ISO date (YYYY-MM-DD), got "${s}".` });
  return null;
}

/**
 * Parse evidence fields from a frontmatter mapping. Never throws; malformed
 * values yield `confidence: null` / band 'unknown' plus an issue — unknown is
 * a designed state, not an error, and is never rendered as confidence.
 */
export function parseEvidence(fm: unknown): EvidenceMeta {
  const issues: EvidenceIssue[] = [];
  const empty: EvidenceMeta = {
    confidence: null,
    band: 'unknown',
    directional: false,
    needsCaveat: false,
    validFrom: null,
    validUntil: null,
    invalidated: null,
    sources: [],
    unmarked: true,
    issues,
  };
  if (!isPlainObject(fm)) return empty;

  const unmarked = EVIDENCE_FIELDS.every((f) => fm[f] === undefined);
  if (unmarked) return empty;

  // confidence — number in [0, 1]; anything else → null + issue (no clamping:
  // a 1.7 is a data error to surface, not a "1.0" to fabricate).
  let confidence: number | null = null;
  if (fm.confidence !== undefined && fm.confidence !== null) {
    const n =
      typeof fm.confidence === 'number'
        ? fm.confidence
        : typeof fm.confidence === 'string' && fm.confidence.trim() !== ''
          ? Number(fm.confidence)
          : NaN;
    if (Number.isFinite(n) && n >= 0 && n <= 1) {
      confidence = n;
    } else {
      issues.push({
        field: 'confidence',
        message: `Expected a number between 0 and 1, got ${JSON.stringify(fm.confidence)}.`,
      });
    }
  }

  // invalidated — string reason, or bare true → '' (labelled, reason unknown).
  let invalidated: string | null = null;
  if (typeof fm.invalidated === 'string' && fm.invalidated.trim() !== '') {
    invalidated = fm.invalidated.trim();
  } else if (fm.invalidated === true) {
    invalidated = '';
  } else if (fm.invalidated !== undefined && fm.invalidated !== null && fm.invalidated !== false) {
    issues.push({
      field: 'invalidated',
      message: 'Expected a reason string or true.',
    });
  }

  const sources = Array.isArray(fm.sources)
    ? fm.sources.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    : [];
  if (fm.sources !== undefined && !Array.isArray(fm.sources)) {
    issues.push({ field: 'sources', message: 'Expected a list.' });
  }

  return {
    confidence,
    band: bandFor(confidence),
    directional: readBool(fm['directional']),
    needsCaveat: readBool(fm['needs-caveat']),
    validFrom: readDate(fm, 'valid-from', issues),
    validUntil: readDate(fm, 'valid-until', issues),
    invalidated,
    sources,
    unmarked: false,
    issues,
  };
}

/** Past its validity window (inclusive of the end date itself). */
export function isExpired(meta: EvidenceMeta, today: string): boolean {
  return meta.validUntil !== null && today > meta.validUntil;
}
