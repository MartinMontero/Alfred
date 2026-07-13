// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import type {
  SessionNotification,
  PromptResponse,
  ToolKind,
  ToolCallStatus,
} from '@agentclientprotocol/sdk';
import { createSessionTap } from './session-tap';
import { generateTraceContext } from './trace';
import type { TelemetryEvent, AgentTurnEvent, ToolCallEvent } from './events';

// --- ACP signal builders (the shapes the tap observes) ----------------------

function toolCall(
  toolCallId: string,
  kind: ToolKind,
  status: ToolCallStatus,
  extra: Record<string, unknown> = {},
): SessionNotification {
  return {
    sessionId: 's1',
    update: { sessionUpdate: 'tool_call', toolCallId, kind, status, title: `tool ${toolCallId}`, ...extra },
  } as unknown as SessionNotification;
}

function toolUpdate(toolCallId: string, status: ToolCallStatus): SessionNotification {
  return {
    sessionId: 's1',
    update: { sessionUpdate: 'tool_call_update', toolCallId, status },
  } as unknown as SessionNotification;
}

const endTurn = { stopReason: 'end_turn' } as PromptResponse;

function harness(traceOn = true) {
  const events: TelemetryEvent[] = [];
  let clock = 1000;
  const ctx = generateTraceContext();
  const tap = createSessionTap({
    traceContext: traceOn ? ctx : undefined,
    record: (e) => {
      events.push(e);
    },
    now: () => clock,
  });
  return { tap, events, ctx, tick: (ms: number) => (clock += ms), set: (ms: number) => (clock = ms) };
}

describe('session-tap — live emission of typed, trace-tagged events', () => {
  it('emits tool_call + agent_turn with correct durations, ok, kind, and the session trace id', () => {
    const h = harness();
    h.set(1000);
    h.tap.startTurn();
    h.set(1010);
    h.tap.onSessionUpdate(toolCall('tc1', 'read', 'in_progress')); // start
    h.set(1040);
    h.tap.onSessionUpdate(toolUpdate('tc1', 'completed')); // end -> dur 30
    h.set(1100);
    h.tap.endTurn(endTurn); // agent_turn dur 100

    expect(h.events).toHaveLength(2);
    const tool = h.events.find((e) => e.kind === 'tool_call') as ToolCallEvent;
    expect(tool).toMatchObject({ tool: 'read', durationMs: 30, ok: true, traceId: h.ctx.traceId });
    expect(tool.spanId).toMatch(/^[0-9a-f]{16}$/);
    const turn = h.events.find((e) => e.kind === 'agent_turn') as AgentTurnEvent;
    expect(turn).toMatchObject({ turnId: 'turn-1', durationMs: 100, ok: true, traceId: h.ctx.traceId });

    // every event carries the same session trace id -> query_by_trace returns one chain
    expect(h.events.every((e) => (e as { traceId?: string }).traceId === h.ctx.traceId)).toBe(true);
  });

  it('a failed tool -> ok:false, errorType "failed"; a thrown turn -> bounded error class, never the message', () => {
    const h = harness();
    h.tap.startTurn();
    h.tap.onSessionUpdate(toolCall('tc2', 'execute', 'in_progress'));
    h.tick(5);
    h.tap.onSessionUpdate(toolUpdate('tc2', 'failed'));
    const tool = h.events.find((e) => e.kind === 'tool_call') as ToolCallEvent;
    expect(tool).toMatchObject({ tool: 'execute', ok: false, errorType: 'failed' });

    h.tap.failTurn(new TypeError('boom SECRET-IN-MESSAGE'));
    const turn = h.events.find((e) => e.kind === 'agent_turn') as AgentTurnEvent;
    expect(turn).toMatchObject({ ok: false, errorType: 'TypeError' });
    expect(JSON.stringify(turn)).not.toContain('boom');
    expect(JSON.stringify(turn)).not.toContain('SECRET');
  });

  it('BORN-REDACTED AT THE TAP: a planted canary in title/rawInput/content/locations reaches NO event', () => {
    const h = harness();
    const CANARY = 'CANARY-SECRET-9f3a-note-body';
    const note = toolCall('tc3', 'read', 'in_progress', {
      title: `read ${CANARY}`,
      rawInput: { path: CANARY, query: CANARY },
      rawOutput: CANARY,
      content: [{ type: 'content', content: { type: 'text', text: CANARY } }],
      locations: [{ path: CANARY }],
    });
    // raw control: the scan CAN find the canary in the inbound signal
    expect(JSON.stringify(note)).toContain(CANARY);

    h.tap.startTurn();
    h.tap.onSessionUpdate(note);
    h.tick(5);
    h.tap.onSessionUpdate(toolUpdate('tc3', 'completed'));
    h.tap.endTurn(endTurn);

    // the tap path leaks none of it
    expect(h.events.length).toBeGreaterThan(0);
    expect(JSON.stringify(h.events)).not.toContain(CANARY);
    const tool = h.events.find((e) => e.kind === 'tool_call') as ToolCallEvent;
    expect(tool.tool).toBe('read'); // only the bounded kind survives
  });

  it('OPT-IN INERT: with no trace context the tap is disabled and emits nothing', () => {
    const h = harness(false);
    expect(h.tap.enabled).toBe(false);
    h.tap.startTurn();
    h.tap.onSessionUpdate(toolCall('x', 'read', 'in_progress'));
    h.tap.onSessionUpdate(toolUpdate('x', 'completed'));
    h.tap.endTurn(endTurn);
    expect(h.events).toHaveLength(0); // zero rows when off
  });

  it('llm_request HONESTY: no per-request boundary => the tap never synthesizes one, even when usage is present', () => {
    const h = harness();
    h.tap.startTurn();
    h.tap.endTurn({
      stopReason: 'end_turn',
      usage: { totalTokens: 100, inputTokens: 80, outputTokens: 20 },
    } as unknown as PromptResponse);
    expect(h.events.some((e) => e.kind === 'llm_request')).toBe(false);
    expect(h.events.filter((e) => e.kind === 'agent_turn')).toHaveLength(1);
  });

  it('per-turn tokens: captured from usage when present; OMITTED (not 0) when absent', () => {
    // present -> the real counts ride agent_turn
    const present = harness();
    present.tap.startTurn();
    present.tap.endTurn({
      stopReason: 'end_turn',
      usage: { totalTokens: 100, inputTokens: 80, outputTokens: 20 },
    } as unknown as PromptResponse);
    const withUsage = present.events.find((e) => e.kind === 'agent_turn') as AgentTurnEvent;
    expect(withUsage).toMatchObject({ inputTokens: 80, outputTokens: 20 });

    // absent -> fields OMITTED entirely, never a fake 0
    const absent = harness();
    absent.tap.startTurn();
    absent.tap.endTurn(endTurn); // no usage
    const noUsage = absent.events.find((e) => e.kind === 'agent_turn') as AgentTurnEvent;
    expect(noUsage.inputTokens).toBeUndefined();
    expect(noUsage.outputTokens).toBeUndefined();
    expect('inputTokens' in noUsage).toBe(false);
    expect('outputTokens' in noUsage).toBe(false);
    // the keys are gone entirely — no fake 0 written into the guardrail signal
    expect(JSON.stringify(noUsage)).not.toContain('inputTokens');
    expect(JSON.stringify(noUsage)).not.toContain('outputTokens');
  });
});

// Phase 5 Step 5 — the latency/grounding guardrail wired through the live tap.
// Still zero-spend: synthetic ACP notifications drive it; no provider turn.
describe('session-tap — latency/grounding guardrail (born-redacted)', () => {
  function guardedHarness() {
    const events: TelemetryEvent[] = [];
    const guardrails: import('./session-tap').TurnGuardrail[] = [];
    let clock = 1000;
    const ctx = generateTraceContext();
    const tap = createSessionTap({
      traceContext: ctx,
      record: (e) => {
        events.push(e);
      },
      onGuardrail: (g) => {
        guardrails.push(g);
      },
      now: () => clock,
    });
    return { tap, guardrails, set: (ms: number) => (clock = ms) };
  }

  it('flags a slow, ungrounded turn as the accuracy-risk shape', () => {
    const h = guardedHarness();
    h.set(1000);
    h.tap.startTurn();
    h.set(1000 + 31_000); // slow, and no read tool ran => ungrounded
    h.tap.endTurn(endTurn);
    expect(h.guardrails).toHaveLength(1);
    expect(h.guardrails[0]).toMatchObject({ grounded: false, signal: 'slow-ungrounded' });
    expect(h.guardrails[0].durationMs).toBe(31_000);
  });

  it('marks a turn grounded when a read-kind tool ran, and resets per turn', () => {
    const h = guardedHarness();
    // Turn 1: a read tool ran and it was fast => ok, grounded.
    h.set(1000);
    h.tap.startTurn();
    h.tap.onSessionUpdate(toolCall('r1', 'read', 'in_progress'));
    h.tap.onSessionUpdate(toolUpdate('r1', 'completed'));
    h.set(1500);
    h.tap.endTurn(endTurn);
    // Turn 2: no read tool, slow => the grounding flag must have RESET to false.
    h.set(5000);
    h.tap.startTurn();
    h.set(5000 + 40_000);
    h.tap.endTurn(endTurn);
    expect(h.guardrails.map((g) => g.signal)).toEqual(['ok', 'slow-ungrounded']);
    expect(h.guardrails.map((g) => g.grounded)).toEqual([true, false]);
  });

  it('the guardrail readout carries no content — only turnId, duration, boolean, signal', () => {
    const h = guardedHarness();
    h.tap.startTurn();
    h.tap.onSessionUpdate(toolCall('r1', 'read', 'in_progress'));
    h.tap.onSessionUpdate(toolUpdate('r1', 'completed'));
    h.tap.endTurn(endTurn);
    const keys = Object.keys(h.guardrails[0]).sort();
    expect(keys).toEqual(['durationMs', 'grounded', 'signal', 'turnId']);
  });
});
