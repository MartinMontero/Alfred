// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Live telemetry emission tap (Phase 5 Step 3b).
 *
 * Observes a real goose ACP session and constructs typed, trace-tagged telemetry
 * events from STEP-0-confirmed signals — closing the "deferred Step-3b" boundary so
 * the born-redacted store and the trace correlation operate on a LIVE stream.
 *
 * Discipline (inherited, non-negotiable):
 *  - BORN-REDACTED AT THE TAP: the mapping reads ONLY bounded scalars/ids/timestamps
 *    (ToolKind, ToolCallStatus, stopReason, toolCallId, clock). Content-bearing ACP
 *    fields (tool title/rawInput/rawOutput/content/locations, the prompt text, an
 *    error message) are never read into an event. The event types (events.ts) have
 *    no text field, so leakage is structurally impossible, not scrubbed after.
 *  - DENY-BY-DEFAULT / OPT-IN: the tap is inert unless a trace context is supplied
 *    (which the caller derives from the SAME telemetry opt-in that gates the store).
 *    Off => no events, no trace ids minted. The single writer re-gates server-side.
 *  - ONE WRITER: events reach the store only via the telemetry_record command.
 *  - TRACE-TAGGED: every event carries the session trace id (+ a per-event span id),
 *    so query_by_trace returns the real session as one chain.
 *
 * llm_request is intentionally NOT emitted: ACP exposes no per-request boundary
 * (PromptResponse.usage is per-turn, @experimental, optional, tokens-only). Per the
 * Step-3b honest minimum we do not synthesize request events.
 */

import type { SessionNotification, PromptResponse, ToolKind } from '@agentclientprotocol/sdk';
import { childSpan, type TraceContext } from './trace';
import type { TelemetryEvent, RecordTelemetry } from './events';
import { evaluateTurnGuardrail, type GuardrailSignal } from './guardrail';

/** A born-redacted latency/grounding guardrail readout for one completed turn
 *  (Phase 5 Step 5). Counts + a bounded signal only — never content. */
export interface TurnGuardrail {
  turnId: string;
  durationMs: number;
  grounded: boolean;
  signal: GuardrailSignal;
}

export interface SessionTapOptions {
  /** The session's W3C trace context. ABSENT => telemetry off => the tap is inert. */
  traceContext?: TraceContext;
  /** The single-writer sink — the caller wires this to the telemetry_record command.
   *  The tap stays a pure signal->event mapper with no Tauri dependency of its own. */
  record: RecordTelemetry;
  /** Optional read-side guardrail observer. Receives a born-redacted
   *  latency/grounding readout per completed turn. NOT persisted — this is a live
   *  observability signal (a persisted metric is a later, Rust-schema change). */
  onGuardrail?: (g: TurnGuardrail) => void;
  /** Monotonic clock in ms (injectable for tests). */
  now?: () => number;
}

export interface SessionTap {
  /** Feed every SessionNotification here (in addition to the UI handler). */
  onSessionUpdate(note: SessionNotification): void;
  /** Mark a prompt turn start (call immediately before session.prompt). */
  startTurn(): void;
  /** Mark a prompt turn end with its response (call after prompt resolves). */
  endTurn(res: PromptResponse): void;
  /** Mark a prompt turn that threw (call in the catch). */
  failTurn(err: unknown): void;
  /** True only when tracing/telemetry is on. */
  readonly enabled: boolean;
}

/** Reduce an unknown throw to a bounded class name — NEVER the message (it may
 *  contain content). Non-word names collapse to the generic 'error'. */
function errorClass(err: unknown): string {
  const name =
    err && typeof err === 'object' && typeof (err as { name?: unknown }).name === 'string'
      ? (err as { name: string }).name
      : '';
  return /^[A-Za-z][A-Za-z0-9]*$/.test(name) ? name : 'error';
}

export function createSessionTap(opts: SessionTapOptions): SessionTap {
  const ctx = opts.traceContext;
  const enabled = ctx !== undefined;
  const record = opts.record;
  const now = opts.now ?? (() => Date.now());

  // start ts + kind keyed by toolCallId. kind is announced on the `tool_call`
  // start; the terminal `tool_call_update` usually omits it, so it is remembered here.
  const toolInfo = new Map<string, { start: number; kind: ToolKind }>();
  let turnStart: number | undefined;
  let turnSeq = 0;
  let turnId = '';
  // Grounding heuristic (born-redacted): did a read-kind tool run this turn?
  // ToolKind 'read' only — never a title/path/arg. Reset at each startTurn.
  let turnGrounded = false;

  // Fire-and-forget; telemetry must never throw into a live session. record() is
  // called synchronously (so a sync test sink captures immediately) and any
  // promise rejection is swallowed.
  function emit(event: TelemetryEvent): void {
    if (!enabled) return;
    try {
      const r = record(event);
      if (r && typeof (r as Promise<void>).then === 'function') {
        (r as Promise<void>).catch(() => {});
      }
    } catch {
      /* a writer failure never affects the session */
    }
  }

  // Per-event trace tag: same trace id (the session), a fresh child span id.
  function tag(): { traceId: string; spanId: string } {
    const c = childSpan(ctx as TraceContext);
    return { traceId: c.traceId, spanId: c.spanId };
  }

  // Born-redacted guardrail readout for a completed turn — counts + a bounded
  // signal, never content. Fire-and-forget; never throws into the session.
  function emitGuardrail(durationMs: number, ok: boolean): void {
    if (!enabled || !opts.onGuardrail) return;
    const signal = evaluateTurnGuardrail({ durationMs, grounded: turnGrounded, ok });
    try {
      opts.onGuardrail({ turnId, durationMs, grounded: turnGrounded, signal });
    } catch {
      /* an observer failure never affects the session */
    }
  }

  function startTool(id: string, kind: ToolKind | null | undefined): void {
    if (!toolInfo.has(id)) toolInfo.set(id, { start: now(), kind: kind ?? 'other' });
    // Grounding: a read-kind tool consulted a source this turn (born-redacted).
    if (kind === 'read') turnGrounded = true;
  }

  function finishTool(id: string, kind: ToolKind | null | undefined, status: 'completed' | 'failed'): void {
    const info = toolInfo.get(id);
    toolInfo.delete(id);
    // Grounding may first be observable on the terminal signal (a tool that
    // arrived already-completed) — catch the read kind here too.
    if ((kind ?? info?.kind) === 'read') turnGrounded = true;
    const durationMs = info ? now() - info.start : 0;
    emit({
      kind: 'tool_call',
      // the bounded ToolKind enum ONLY (terminal signal's kind, else the remembered
      // start kind, else 'other') — never title/args/output.
      tool: kind ?? info?.kind ?? 'other',
      durationMs,
      ok: status === 'completed',
      ...(status === 'failed' ? { errorType: 'failed' } : {}),
      ...tag(),
    });
  }

  return {
    enabled,

    onSessionUpdate(note: SessionNotification): void {
      if (!enabled) return;
      const u = note.update;
      if (u.sessionUpdate === 'tool_call') {
        // A tool call announced. Read only id/kind/status — drop title/rawInput/content/locations.
        if (u.status === 'completed' || u.status === 'failed') {
          finishTool(u.toolCallId, u.kind, u.status);
        } else {
          startTool(u.toolCallId, u.kind);
        }
      } else if (u.sessionUpdate === 'tool_call_update') {
        if (u.status === 'completed' || u.status === 'failed') {
          finishTool(u.toolCallId, u.kind, u.status);
        } else if (u.status === 'in_progress') {
          startTool(u.toolCallId, u.kind);
        }
      }
      // message/thought/plan/usage updates carry text or non-request aggregates — ignored.
    },

    startTurn(): void {
      if (!enabled) return;
      turnStart = now();
      turnId = `turn-${++turnSeq}`; // a sequence id, never the prompt text
      turnGrounded = false; // reset the per-turn grounding heuristic
    },

    endTurn(res: PromptResponse): void {
      if (!enabled || turnStart === undefined) return;
      const durationMs = now() - turnStart;
      turnStart = undefined;
      const stop = res.stopReason; // bounded enum
      const ok = stop === 'end_turn';
      // Per-turn token usage iff ACP actually reports it (@experimental). Counts only;
      // OMITTED when absent — never write a fake 0 into a guardrail signal.
      const usage = res.usage;
      const tokens =
        usage != null
          ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
          : {};
      emit({
        kind: 'agent_turn',
        turnId,
        durationMs,
        ok,
        ...(ok ? {} : { errorType: stop }),
        ...tokens,
        ...tag(),
      });
      emitGuardrail(durationMs, ok);
    },

    failTurn(err: unknown): void {
      if (!enabled || turnStart === undefined) return;
      const durationMs = now() - turnStart;
      turnStart = undefined;
      emit({
        kind: 'agent_turn',
        turnId,
        durationMs,
        ok: false,
        errorType: errorClass(err), // bounded class, never err.message
        ...tag(),
      });
      emitGuardrail(durationMs, false);
    },
  };
}
