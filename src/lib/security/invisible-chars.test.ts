// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { sanitize, hasWarnings } from './invisible-chars';

const cp = (n: number) => String.fromCodePoint(n);

describe('sanitize — STRIP set (silent removal)', () => {
  it('strips zero-width / invisible-format chars and records them as "stripped"', () => {
    const raw = `a${cp(0x200b)}b${cp(0x200c)}c${cp(0x200d)}d${cp(0x2060)}e${cp(0xfeff)}f`;
    const { clean, findings } = sanitize(raw);
    expect(clean).toBe('abcdef');
    expect(findings).toHaveLength(5);
    expect(findings.every((f) => f.severity === 'stripped')).toBe(true);
    expect(findings.map((f) => f.codepoint)).toEqual([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
    expect(findings[0].name).toBe('ZERO WIDTH SPACE');
  });

  it('records correct UTF-16 offsets', () => {
    const { findings } = sanitize(`ab${cp(0x200b)}cd`);
    expect(findings[0].offset).toBe(2);
  });

  it('strips the extended standard set (soft hyphen, CGJ, Hangul/Khmer fillers, BOM)', () => {
    const raw = `x${cp(0x00ad)}${cp(0x034f)}${cp(0x180e)}${cp(0x3164)}${cp(0xffa0)}y`;
    expect(sanitize(raw).clean).toBe('xy');
  });
});

describe('sanitize — WARN set (loud, retained until acknowledged)', () => {
  it('flags a bidi/Trojan-Source override (U+202E) as a warning, not stripped, retained in clean', () => {
    const raw = `safe${cp(0x202e)}txet`;
    const { clean, findings } = sanitize(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].name).toBe('RIGHT-TO-LEFT OVERRIDE');
    expect(findings[0].offset).toBe(4);
    expect(clean).toContain(cp(0x202e)); // retained by default
    expect(hasWarnings(findings)).toBe(true);
  });

  it('flags Tags-block chars and DECODES the smuggled ASCII payload', () => {
    // Smuggle "Hi" via the Tags block: 'H'=0x48 -> U+E0048, 'i'=0x69 -> U+E0069.
    const raw = `hello${cp(0xe0048)}${cp(0xe0069)}`;
    const { findings } = sanitize(raw);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === 'warning')).toBe(true);
    expect(findings.map((f) => f.decoded).join('')).toBe('Hi');
    expect(findings[0].name).toContain('UNICODE TAG');
    // Astral chars are surrogate pairs → offset is the UTF-16 index.
    expect(findings[0].offset).toBe(5);
    expect(findings[1].offset).toBe(7);
  });

  it('flags a control tag (U+E0001) as a warning with no printable payload', () => {
    const { findings } = sanitize(cp(0xe0001));
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].decoded).toBeUndefined();
  });

  it('flags a supplementary variation selector (U+E0100) as a warning', () => {
    const { findings } = sanitize(`a${cp(0xe0100)}`);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].name).toContain('VARIATION SELECTOR-17');
  });

  it('does NOT flag legitimate emoji variation selectors (U+FE0F, e.g. ❤️)', () => {
    const heart = `${cp(0x2764)}${cp(0xfe0f)}`; // ❤️
    const { clean, findings } = sanitize(heart);
    expect(findings).toHaveLength(0);
    expect(clean).toBe(heart);
  });
});

describe('sanitize — stripWarnings (post-acknowledgement)', () => {
  it('removes warning chars from clean when stripWarnings is set, still recording them', () => {
    const raw = `safe${cp(0x202e)}${cp(0xe0048)}done`;
    const { clean, findings } = sanitize(raw, { stripWarnings: true });
    expect(clean).toBe('safedone');
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === 'warning')).toBe(true);
  });
});

describe('sanitize — clean passthrough', () => {
  it('leaves ordinary text and normal whitespace untouched', () => {
    const raw = 'Summarize my vault.\n  - hot.md\n  - memory-bank/\n';
    const { clean, findings } = sanitize(raw);
    expect(clean).toBe(raw);
    expect(findings).toHaveLength(0);
    expect(hasWarnings(findings)).toBe(false);
  });
});
