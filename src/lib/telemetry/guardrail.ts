// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Latency–accuracy guardrail (Phase 5 Step 5), Option B: a deterministic,
 * read-side, born-redacted signal over an agent turn. No LLM judges the answer;
 * we combine two facts we already have — how long the turn took
 * (`agent_turn.durationMs`) and whether the turn consulted a source
 * (a read-kind tool ran) — into an accuracy-RISK flag.
 *
 * The premise: a turn that answered SLOWLY and WITHOUT consulting the vault is
 * the highest-risk shape — the model likely worked from parametric memory under
 * load, which is where hallucination lives. This does not measure correctness;
 * it flags the turns a human should spot-check.
 *
 * Redaction: the grounding input is the bounded ACP `ToolKind` value `'read'` —
 * NOT a tool title, path, argument, or output. It is an observability heuristic,
 * never a gate. (ToolKind 'read' is a strictly-more-redacted signal than the
 * title-allowlist; see docs/audit/phase5.md for the note.) Pure / testable.
 */

/** A turn slower than this (ms) is "slow" for the guardrail. Conservative default;
 *  interactive agent turns that consult tools routinely run into tens of seconds. */
export const GUARDRAIL_SLOW_MS = 30_000;

export type GuardrailSignal = 'ok' | 'slow' | 'ungrounded' | 'slow-ungrounded';

export interface TurnObservation {
  durationMs: number;
  /** Did a read-kind tool run this turn? (ToolKind='read'; born-redacted heuristic.) */
  grounded: boolean;
  /** Did the turn complete cleanly (stopReason end_turn)? Failed turns are not risk-scored. */
  ok: boolean;
}

/**
 * Classify one turn. Failed turns return 'ok' (they are not an accuracy risk —
 * they produced no answer to trust). A clean turn is flagged by the two axes:
 * slow (over threshold) and ungrounded (no read tool ran).
 */
export function evaluateTurnGuardrail(
  obs: TurnObservation,
  slowMs: number = GUARDRAIL_SLOW_MS,
): GuardrailSignal {
  if (!obs.ok) return 'ok';
  const slow = obs.durationMs >= slowMs;
  const ungrounded = !obs.grounded;
  if (slow && ungrounded) return 'slow-ungrounded';
  if (slow) return 'slow';
  if (ungrounded) return 'ungrounded';
  return 'ok';
}

/** Is this signal one a human should spot-check? */
export function isRisk(signal: GuardrailSignal): boolean {
  return signal === 'slow-ungrounded';
}

export interface GuardrailSummary {
  turns: number;
  slow: number;
  ungrounded: number;
  /** The accuracy-risk turns: slow AND ungrounded. */
  slowUngrounded: number;
}

/** Aggregate guardrail signals across a session's clean turns (counts only). */
export function summarizeGuardrail(
  observations: TurnObservation[],
  slowMs: number = GUARDRAIL_SLOW_MS,
): GuardrailSummary {
  const summary: GuardrailSummary = { turns: 0, slow: 0, ungrounded: 0, slowUngrounded: 0 };
  for (const obs of observations) {
    if (!obs.ok) continue; // failed turns are not risk-scored
    summary.turns += 1;
    const signal = evaluateTurnGuardrail(obs, slowMs);
    if (signal === 'slow' || signal === 'slow-ungrounded') summary.slow += 1;
    if (signal === 'ungrounded' || signal === 'slow-ungrounded') summary.ungrounded += 1;
    if (signal === 'slow-ungrounded') summary.slowUngrounded += 1;
  }
  return summary;
}
