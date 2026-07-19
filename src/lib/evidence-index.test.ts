// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Evidence index — the pure layer behind the shell-wide evidence surfaces
 * (sidebar band glyphs, evidence filter, Build Memory ledger). Red-first:
 * these tests encode the mechanism (parse → index → filter → ledger order)
 * and fail without it.
 */
import { describe, expect, it } from 'vitest';
import {
  buildEvidenceIndex,
  ledgerEntries,
  matchesEvidenceFilter,
  noteEvidence,
} from './evidence-index';

const MARKED_HIGH = `---
title: settled decision
confidence: 0.9
valid-from: 2026-07-01
sources:
  - docs/audit/phase4.md
---
Body.
`;

const MARKED_LOW = `---
confidence: 0.2
---
Body.
`;

const MARKED_EXPIRED = `---
confidence: 0.8
valid-until: 2026-01-31
---
Body.
`;

const MARKED_INVALIDATED = `---
confidence: 0.8
invalidated: superseded by ADR 0006
---
Body.
`;

const UNMARKED = `---
title: plain note
---
Body.
`;

const NO_FRONTMATTER = `Just prose, no fence.
`;

const TODAY = '2026-07-19';

describe('noteEvidence', () => {
  it('parses evidence frontmatter out of note content', () => {
    const meta = noteEvidence(MARKED_HIGH);
    expect(meta.unmarked).toBe(false);
    expect(meta.band).toBe('high');
    expect(meta.validFrom).toBe('2026-07-01');
    expect(meta.sources).toEqual(['docs/audit/phase4.md']);
  });

  it('treats notes without evidence fields (or without frontmatter) as unmarked', () => {
    expect(noteEvidence(UNMARKED).unmarked).toBe(true);
    expect(noteEvidence(NO_FRONTMATTER).unmarked).toBe(true);
  });
});

describe('buildEvidenceIndex', () => {
  it('indexes only markdown files and keeps unmarked entries out', () => {
    const index = buildEvidenceIndex(
      new Map([
        ['/v/a.md', MARKED_HIGH],
        ['/v/b.md', UNMARKED],
        ['/v/img.png', 'binary-ish'],
      ]),
    );
    expect(index.get('/v/a.md')?.band).toBe('high');
    expect(index.has('/v/b.md')).toBe(false);
    expect(index.has('/v/img.png')).toBe(false);
  });
});

describe('matchesEvidenceFilter', () => {
  const high = noteEvidence(MARKED_HIGH);
  const low = noteEvidence(MARKED_LOW);
  const expired = noteEvidence(MARKED_EXPIRED);
  const invalidated = noteEvidence(MARKED_INVALIDATED);

  it("'all' admits everything, including unmarked", () => {
    expect(matchesEvidenceFilter(undefined, 'all', TODAY)).toBe(true);
    expect(matchesEvidenceFilter(high, 'all', TODAY)).toBe(true);
  });

  it("'marked' admits only notes carrying evidence fields", () => {
    expect(matchesEvidenceFilter(undefined, 'marked', TODAY)).toBe(false);
    expect(matchesEvidenceFilter(high, 'marked', TODAY)).toBe(true);
    expect(matchesEvidenceFilter(low, 'marked', TODAY)).toBe(true);
  });

  it("'attention' admits low band, expired windows, and invalidated — not healthy high", () => {
    expect(matchesEvidenceFilter(high, 'attention', TODAY)).toBe(false);
    expect(matchesEvidenceFilter(low, 'attention', TODAY)).toBe(true);
    expect(matchesEvidenceFilter(expired, 'attention', TODAY)).toBe(true);
    expect(matchesEvidenceFilter(invalidated, 'attention', TODAY)).toBe(true);
  });
});

describe('ledgerEntries', () => {
  it('returns only marked notes, dated entries first (newest first), then undated by name', () => {
    const index = buildEvidenceIndex(
      new Map([
        ['/v/zeta-undated.md', MARKED_LOW],
        ['/v/dated-old.md', MARKED_EXPIRED.replace('valid-until: 2026-01-31', 'valid-from: 2026-01-31')],
        ['/v/dated-new.md', MARKED_HIGH],
        ['/v/alpha-undated.md', MARKED_INVALIDATED],
        ['/v/plain.md', UNMARKED],
      ]),
    );
    const rows = ledgerEntries(index, TODAY);
    expect(rows.map((r) => r.path)).toEqual([
      '/v/dated-new.md',
      '/v/dated-old.md',
      '/v/alpha-undated.md',
      '/v/zeta-undated.md',
    ]);
    expect(rows[0].name).toBe('dated-new');
    expect(rows[0].date).toBe('2026-07-01');
  });

  it('flags expired windows on the entry so the ledger can label them', () => {
    const index = buildEvidenceIndex(new Map([['/v/e.md', MARKED_EXPIRED]]));
    expect(ledgerEntries(index, TODAY)[0].expired).toBe(true);
  });
});
