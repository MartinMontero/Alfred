// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Test fixture (imported by tests only, never by app code): the W0 planted
 * canaries for invisible-Unicode ranges the sanitizer used to miss
 * (BuilderOS integration audit, 2026-11-16, workstream W0).
 *
 * Each row is one range; every code point in it is planted, so a partial fix
 * (catching only the first member of a range) still fails. Names and general
 * categories were checked against the Unicode Character Database (Python
 * unicodedata, UCD 15.1.0) and Node's ICU (Unicode 17.0) property tables.
 *
 * Expected severity follows the sanitizer's two-tier policy:
 *  - 'stripped': invisible format characters with no legitimate purpose in
 *    machine input (removed silently, reported as a notice).
 *  - 'warning': characters that can deceive a human reader or carry a hidden
 *    payload (kept and flagged until a person acknowledges them).
 */
import type { Severity } from './invisible-chars';

export interface CanaryRange {
  label: string;
  codepoints: number[];
  severity: Severity;
}

function span(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let cp = lo; cp <= hi; cp++) out.push(cp);
  return out;
}

export const W0_CANARY_RANGES: CanaryRange[] = [
  // Zl / Zp: a line break to some renderers and parsers, ordinary text to
  // others (YAML 1.2), so the layout a person sees can differ from the parse.
  { label: 'U+2028-U+2029 line/paragraph separators', codepoints: [0x2028, 0x2029], severity: 'warning' },
  // Unassigned, default-ignorable slot inside the invisible-operator block.
  { label: 'U+2065 unassigned invisible-operator slot', codepoints: [0x2065], severity: 'stripped' },
  // Deprecated format controls (symmetric swapping, Arabic shaping, digit shapes).
  { label: 'U+206A-U+206F deprecated format controls', codepoints: span(0x206a, 0x206f), severity: 'stripped' },
  // Interlinear annotation controls: renderers may hide the annotated text.
  { label: 'U+FFF9-U+FFFB interlinear annotation controls', codepoints: span(0xfff9, 0xfffb), severity: 'warning' },
  // Mongolian free variation selectors: invisible selectors usable as a covert channel.
  {
    label: 'U+180B-U+180D, U+180F Mongolian free variation selectors',
    codepoints: [0x180b, 0x180c, 0x180d, 0x180f],
    severity: 'warning',
  },
  // Musical notation format controls (beam/tie/slur/phrase): invisible.
  { label: 'U+1D173-U+1D17A musical format controls', codepoints: span(0x1d173, 0x1d17a), severity: 'stripped' },
  // Unassigned, default-ignorable plane-14 slots right after the Tags block:
  // the same smuggling trick as Tags, extended to byte values 0x80-0xFF.
  { label: 'U+E0080-U+E00FF unassigned tag-adjacent range', codepoints: span(0xe0080, 0xe00ff), severity: 'warning' },
];

/** The planted string for a range: each code point preceded by a visible 'x'. */
export function plant(codepoints: number[]): string {
  return codepoints.map((cp) => `x${String.fromCodePoint(cp)}`).join('');
}
