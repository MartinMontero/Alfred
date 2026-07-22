// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  knowabilityLabel,
  isEliminated,
  hypothesisText,
  limitsSections,
  type LimitsDto,
} from './analytical';

describe('analytical render helpers — the honesty is rendered, never truncated', () => {
  it('labels knowability plainly (verdict-first, no loop vocabulary)', () => {
    expect(knowabilityLabel('high_validity')).toMatch(/knowable/i);
    expect(knowabilityLabel('low_validity')).toMatch(/provisional/i);
    expect(knowabilityLabel(null)).toMatch(/not assigned/i);
    // Two-layer rule: no build/loop words leak into UI copy.
    for (const k of ['high_validity', 'low_validity', null] as const) {
      expect(knowabilityLabel(k).toLowerCase()).not.toMatch(/\b(loop|track|phase|pass|commit|ledger)\b/);
    }
  });

  it('detects and unwraps the crate [eliminated] label without dropping the text', () => {
    expect(isEliminated('[eliminated] the fund never existed')).toBe(true);
    expect(isEliminated('the transfer was authorized')).toBe(false);
    // The claim itself is preserved for display (only the marker is stripped).
    expect(hypothesisText('[eliminated] the fund never existed')).toBe('the fund never existed');
    expect(hypothesisText('the transfer was authorized')).toBe('the transfer was authorized');
  });

  it('renders every non-empty limits part in canonical order, dropping only empties', () => {
    const limits: LimitsDto = {
      whatWouldChangeTheConclusion: ['a signed authorization'],
      whatCouldNotBeChecked: [],
      whereTheEvidenceRunsOut: ['after FY2026', 'outside the jurisdiction'],
    };
    const sections = limitsSections(limits);
    expect(sections.map((s) => s.label)).toEqual([
      'What would change the conclusion',
      'Where the evidence runs out',
    ]);
    // Nothing inside a populated part is truncated.
    expect(sections[1].items).toEqual(['after FY2026', 'outside the jurisdiction']);
  });

  it('returns no sections for an absent limits statement', () => {
    expect(limitsSections(null)).toEqual([]);
  });
});
