// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { parseEvidence, bandFor, isExpired } from './evidence';

describe('bandFor', () => {
  it('maps thresholds: high ≥ 0.75, mid ≥ 0.40, else low; null → unknown', () => {
    expect(bandFor(0.9)).toBe('high');
    expect(bandFor(0.75)).toBe('high');
    expect(bandFor(0.7499)).toBe('mid');
    expect(bandFor(0.4)).toBe('mid');
    expect(bandFor(0.39)).toBe('low');
    expect(bandFor(0)).toBe('low');
    expect(bandFor(1)).toBe('high');
    expect(bandFor(null)).toBe('unknown');
  });
});

describe('parseEvidence — happy paths', () => {
  it('reads a fully marked claim', () => {
    const m = parseEvidence({
      confidence: 0.82,
      sources: ['https://example.org/spec', 'docs/audit/phase4.md'],
      'valid-from': '2026-06-01',
      'valid-until': '2026-12-31',
      directional: false,
      'needs-caveat': false,
    });
    expect(m.unmarked).toBe(false);
    expect(m.confidence).toBe(0.82);
    expect(m.band).toBe('high');
    expect(m.sources).toHaveLength(2);
    expect(m.validFrom).toBe('2026-06-01');
    expect(m.validUntil).toBe('2026-12-31');
    expect(m.invalidated).toBeNull();
    expect(m.issues).toHaveLength(0);
  });

  it('reads flags (bool or "true" string, YAML-tolerant)', () => {
    const m = parseEvidence({ confidence: 0.5, directional: true, 'needs-caveat': 'true' });
    expect(m.directional).toBe(true);
    expect(m.needsCaveat).toBe(true);
    expect(m.band).toBe('mid');
  });

  it('invalidation carries a visible reason; bare true yields empty-string label', () => {
    expect(parseEvidence({ invalidated: 'superseded by ADR-0003' }).invalidated).toBe(
      'superseded by ADR-0003',
    );
    expect(parseEvidence({ invalidated: true }).invalidated).toBe('');
    expect(parseEvidence({ confidence: 0.9, invalidated: false }).invalidated).toBeNull();
  });
});

describe('parseEvidence — unmarked notes render nothing', () => {
  it('no evidence fields at all → unmarked, no issues', () => {
    const m = parseEvidence({ id: 'n1', description: 'a note', tags: [], domain: 'x', updated: '2026-07-01' });
    expect(m.unmarked).toBe(true);
    expect(m.band).toBe('unknown');
    expect(m.issues).toHaveLength(0);
  });
  it('null / non-object frontmatter → unmarked', () => {
    expect(parseEvidence(null).unmarked).toBe(true);
    expect(parseEvidence('yaml?').unmarked).toBe(true);
    expect(parseEvidence(['a']).unmarked).toBe(true);
  });
});

describe('parseEvidence — malformed inputs are designed states (journey 3)', () => {
  it('confidence "high" → unknown band + issue, never fabricated', () => {
    const m = parseEvidence({ confidence: 'high' });
    expect(m.confidence).toBeNull();
    expect(m.band).toBe('unknown');
    expect(m.unmarked).toBe(false);
    expect(m.issues.some((i) => i.field === 'confidence')).toBe(true);
  });
  it('out-of-range 1.7 and -0.2 → issue, not clamped', () => {
    for (const v of [1.7, -0.2]) {
      const m = parseEvidence({ confidence: v });
      expect(m.confidence).toBeNull();
      expect(m.band).toBe('unknown');
      expect(m.issues).toHaveLength(1);
    }
  });
  it('numeric strings parse ("0.6"), garbage does not', () => {
    expect(parseEvidence({ confidence: '0.6' }).band).toBe('mid');
    expect(parseEvidence({ confidence: '' }).issues).toHaveLength(1);
    expect(parseEvidence({ confidence: NaN }).band).toBe('unknown');
  });
  it('bad dates and non-list sources surface as issues, fields null/empty', () => {
    const m = parseEvidence({ confidence: 0.9, 'valid-until': 'soon', sources: 'the internet' });
    expect(m.validUntil).toBeNull();
    expect(m.sources).toEqual([]);
    expect(m.issues.map((i) => i.field).sort()).toEqual(['sources', 'valid-until']);
  });
});

describe('isExpired', () => {
  it('inclusive of the end date; no window → never expired', () => {
    const m = parseEvidence({ confidence: 0.9, 'valid-until': '2026-07-01' });
    expect(isExpired(m, '2026-07-01')).toBe(false);
    expect(isExpired(m, '2026-07-02')).toBe(true);
    expect(isExpired(parseEvidence({ confidence: 0.9 }), '2099-01-01')).toBe(false);
  });
});
