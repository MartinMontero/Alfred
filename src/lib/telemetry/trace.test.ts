// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  generateTraceContext,
  childSpan,
  parseTraceparent,
  buildBaggage,
  traceMeta,
  withTraceContext,
  optionalTraceMeta,
  extractTraceContext,
  TRACE_CONTEXT_KEYS,
} from './trace';

describe('traceparent generation / parse', () => {
  it('generates a valid W3C traceparent and round-trips', () => {
    const ctx = generateTraceContext();
    expect(ctx.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    expect(ctx.traceId).toHaveLength(32);
    expect(ctx.spanId).toHaveLength(16);
    const parsed = parseTraceparent(ctx.traceparent);
    expect(parsed).toEqual(ctx);
  });

  it('generates unique trace ids', () => {
    expect(generateTraceContext().traceId).not.toBe(generateTraceContext().traceId);
  });

  it('childSpan keeps the trace id, changes the span id', () => {
    const root = generateTraceContext();
    const child = childSpan(root);
    expect(child.traceId).toBe(root.traceId);
    expect(child.spanId).not.toBe(root.spanId);
  });

  it('rejects malformed and all-zero ids', () => {
    expect(parseTraceparent('garbage')).toBeNull();
    expect(parseTraceparent('00-zzz-zzz-01')).toBeNull();
    expect(parseTraceparent(`00-${'0'.repeat(32)}-${'0'.repeat(16)}-01`)).toBeNull();
  });
});

describe('born-redacted baggage (allowlist only)', () => {
  it('emits only the allowlisted correlation fields', () => {
    const b = buildBaggage({ traceId: 'abc', tool: 'vault_read', durationMs: 30, count: 5 });
    expect(b).toBe('trace_id=abc,tool=vault_read,count=5,duration_ms=30');
  });

  it('a non-allowlisted key (note body / secret) is structurally ignored at runtime', () => {
    // Even if a caller casts past the type, only allowlisted fields are read.
    const sneaky = { tool: 'vault_read', noteBody: 'CANARY-SECRET-CONTENT', apiKey: 'sk-leak' } as unknown as Parameters<typeof buildBaggage>[0];
    const b = buildBaggage(sneaky);
    expect(b).toBe('tool=vault_read');
    expect(b).not.toContain('CANARY-SECRET-CONTENT');
    expect(b).not.toContain('sk-leak');
  });

  it('type-level: a note-body/secret field is a COMPILE error in baggage', () => {
    // @ts-expect-error — `noteBody` is not an allowlisted CorrelationBaggage field.
    buildBaggage({ noteBody: 'leaked' });
    // @ts-expect-error — `apiKey` is not allowlisted either.
    buildBaggage({ apiKey: 'sk-leak' });
    expect(true).toBe(true);
  });
});

describe('_meta injection / extraction (SEP-414 carrier)', () => {
  it('injects the reserved keys; the same trace id rides BOTH the ACP and MCP carriers', () => {
    const ctx = generateTraceContext();
    const acpMeta = withTraceContext({ existing: 1 }, ctx, { baggage: { tool: 'vault_read' } });
    const mcpMeta = withTraceContext<Record<string, unknown>>({}, ctx);

    expect(acpMeta).toMatchObject({ existing: 1, traceparent: ctx.traceparent, baggage: 'tool=vault_read' });
    expect(extractTraceContext(acpMeta)?.traceId).toBe(ctx.traceId);
    expect(extractTraceContext(mcpMeta)?.traceId).toBe(ctx.traceId);
    // identical trace id across the two surfaces
    expect(extractTraceContext(acpMeta)?.traceId).toBe(extractTraceContext(mcpMeta)?.traceId);
  });

  it('uses exactly the SEP-414 reserved key names', () => {
    expect([...TRACE_CONTEXT_KEYS]).toEqual(['traceparent', 'tracestate', 'baggage']);
    const m = traceMeta(generateTraceContext(), { tracestate: 'a=1', baggage: { count: 2 } });
    expect(Object.keys(m).sort()).toEqual(['baggage', 'traceparent', 'tracestate']);
  });

  it('OPT-IN INERT: with no context, NONE of the reserved keys are injected', () => {
    const original = { existing: 1 };
    const out = withTraceContext(original, undefined) as Record<string, unknown>;
    expect(out).toBe(original); // same reference, untouched
    expect(extractTraceContext(out)).toBeNull();
    // every reserved W3C key is absent — not just traceparent
    for (const k of TRACE_CONTEXT_KEYS) expect(k in out).toBe(false);
    expect(Object.keys(original)).toEqual(['existing']);
  });

  it('OPT-IN INERT (the ACP door gate): no context -> no _meta object at all to inject', () => {
    // acp-client injects exactly optionalTraceMeta(opts.traceContext) — off means undefined.
    expect(optionalTraceMeta(undefined)).toBeUndefined();
    const on = optionalTraceMeta(generateTraceContext(), { baggage: { tool: 'vault_read' } });
    expect(on).toBeDefined();
    expect(Object.keys(on as object).sort()).toEqual(['baggage', 'traceparent']);
  });

  it('extractTraceContext returns null for meta without a traceparent', () => {
    expect(extractTraceContext({})).toBeNull();
    expect(extractTraceContext(null)).toBeNull();
    expect(extractTraceContext({ traceparent: 'bad' })).toBeNull();
  });
});
