// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  evaluateTurnGuardrail,
  summarizeGuardrail,
  isRisk,
  GUARDRAIL_SLOW_MS,
} from './guardrail';

// ZERO-SPEND SMOKE: the guardrail must fire correctly on synthetic turns with no
// provider turn at all. The one thing this cannot exercise here is capturing a
// REAL goose turn's latency + grounding — that is a paid provider turn, routed
// to Martin as a BLOCKED item. Everything deterministic is proven below.
describe('evaluateTurnGuardrail — Option B latency/grounding signal', () => {
  const fast = 1_000;
  const slow = GUARDRAIL_SLOW_MS + 1;

  it('fast + grounded + ok => ok', () => {
    expect(evaluateTurnGuardrail({ durationMs: fast, grounded: true, ok: true })).toBe('ok');
  });

  it('slow + grounded => slow (consulted a source, just slowly)', () => {
    expect(evaluateTurnGuardrail({ durationMs: slow, grounded: true, ok: true })).toBe('slow');
  });

  it('fast + ungrounded => ungrounded', () => {
    expect(evaluateTurnGuardrail({ durationMs: fast, grounded: false, ok: true })).toBe('ungrounded');
  });

  it('slow + ungrounded => slow-ungrounded (the accuracy-risk shape)', () => {
    const s = evaluateTurnGuardrail({ durationMs: slow, grounded: false, ok: true });
    expect(s).toBe('slow-ungrounded');
    expect(isRisk(s)).toBe(true);
  });

  it('a failed turn is never risk-scored (no answer to trust)', () => {
    expect(evaluateTurnGuardrail({ durationMs: slow, grounded: false, ok: false })).toBe('ok');
  });

  it('threshold is inclusive at exactly GUARDRAIL_SLOW_MS', () => {
    expect(evaluateTurnGuardrail({ durationMs: GUARDRAIL_SLOW_MS, grounded: false, ok: true })).toBe('slow-ungrounded');
    expect(evaluateTurnGuardrail({ durationMs: GUARDRAIL_SLOW_MS - 1, grounded: false, ok: true })).toBe('ungrounded');
  });
});

describe('summarizeGuardrail — session counts', () => {
  it('counts slow, ungrounded, and the risk intersection; skips failed turns', () => {
    const s = summarizeGuardrail([
      { durationMs: 1_000, grounded: true, ok: true }, // ok
      { durationMs: 40_000, grounded: true, ok: true }, // slow
      { durationMs: 1_000, grounded: false, ok: true }, // ungrounded
      { durationMs: 40_000, grounded: false, ok: true }, // slow-ungrounded (risk)
      { durationMs: 90_000, grounded: false, ok: false }, // failed — skipped
    ]);
    expect(s.turns).toBe(4);
    expect(s.slow).toBe(2);
    expect(s.ungrounded).toBe(2);
    expect(s.slowUngrounded).toBe(1);
  });

  it('empty input => all zero', () => {
    expect(summarizeGuardrail([])).toEqual({ turns: 0, slow: 0, ungrounded: 0, slowUngrounded: 0 });
  });
});
