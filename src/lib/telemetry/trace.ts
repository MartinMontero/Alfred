// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * W3C Trace Context core for cross-stack correlation (Phase 5 Step 4 / SEP-414).
 *
 * A single agent session is correlated across Alfred → MCP server → goose by a
 * shared trace id, carried in MCP/ACP `_meta` under the reserved W3C keys
 * (`traceparent`/`tracestate`/`baggage`) — SEP-414's exception to the `_meta`
 * key-prefix rule.
 *
 * BORN-REDACTED BAGGAGE: baggage is a typed **allowlist** of correlation-only
 * fields (trace/span id, tool name, counts, durations). There is no field for
 * note content, prompts, tool arguments, or secrets — the type makes it
 * impossible. Same discipline as the Step-3 telemetry store; baggage is not a
 * side channel for raw data.
 *
 * Pure, deterministic except for the random id, zero LLM inference, no new deps
 * (uses Web Crypto, available in both the Tauri webview and Node).
 */

/** The reserved W3C `_meta` keys (SEP-414). Must match mcp/server.ts TRACE_CONTEXT_KEYS. */
export const TRACE_CONTEXT_KEYS = ['traceparent', 'tracestate', 'baggage'] as const;

export interface TraceContext {
  /** 32 lowercase hex chars (16 bytes). */
  traceId: string;
  /** 16 lowercase hex chars (8 bytes). */
  spanId: string;
  /** 2 hex chars; '01' = sampled. */
  flags: string;
  /** The W3C `00-<traceid>-<spanid>-<flags>` header value. */
  traceparent: string;
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  let s = '';
  for (const b of a) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Generate a fresh W3C trace context (new trace id + root span id, sampled). */
export function generateTraceContext(): TraceContext {
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  const flags = '01';
  return { traceId, spanId, flags, traceparent: `00-${traceId}-${spanId}-${flags}` };
}

/** Generate a child span id under an existing trace. */
export function childSpan(ctx: TraceContext): TraceContext {
  const spanId = randomHex(8);
  return { ...ctx, spanId, traceparent: `00-${ctx.traceId}-${spanId}-${ctx.flags}` };
}

const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/** Parse + validate a W3C traceparent. Rejects all-zero trace/span ids (invalid). */
export function parseTraceparent(value: string): TraceContext | null {
  const m = TRACEPARENT_RE.exec(value);
  if (!m) return null;
  const [, traceId, spanId, flags] = m;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return { traceId, spanId, flags, traceparent: value };
}

// --- born-redacted baggage (allowlist) --------------------------------------

/** The ONLY fields baggage may carry — correlation, never content. */
export interface CorrelationBaggage {
  traceId?: string;
  spanId?: string;
  tool?: string;
  count?: number;
  durationMs?: number;
}

const BAGGAGE_FIELDS: ReadonlyArray<[keyof CorrelationBaggage, string]> = [
  ['traceId', 'trace_id'],
  ['spanId', 'span_id'],
  ['tool', 'tool'],
  ['count', 'count'],
  ['durationMs', 'duration_ms'],
];

/** Build a W3C `baggage` value from ONLY the allowlisted correlation fields. Any
 *  key not in the allowlist is structurally ignored — it cannot be emitted. */
export function buildBaggage(b: CorrelationBaggage): string {
  const parts: string[] = [];
  for (const [key, wire] of BAGGAGE_FIELDS) {
    const v = b[key];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${wire}=${encodeURIComponent(String(v))}`);
  }
  return parts.join(',');
}

// --- _meta injection / extraction (the SEP-414 carrier) ----------------------

export interface TraceMeta {
  traceparent: string;
  tracestate?: string;
  baggage?: string;
}

export interface TraceMetaOptions {
  tracestate?: string;
  baggage?: CorrelationBaggage;
}

/** Build the `_meta` trace fields from a context (+ optional allowlisted baggage). */
export function traceMeta(ctx: TraceContext, opts?: TraceMetaOptions): TraceMeta {
  const out: TraceMeta = { traceparent: ctx.traceparent };
  if (opts?.tracestate) out.tracestate = opts.tracestate;
  if (opts?.baggage) {
    const b = buildBaggage(opts.baggage);
    if (b) out.baggage = b;
  }
  return out;
}

/**
 * Inject the trace context into an MCP/ACP `_meta` object. **Opt-in inert:** when
 * `ctx` is undefined (tracing off), the meta is returned UNCHANGED — no keys added.
 */
export function withTraceContext<T extends Record<string, unknown>>(
  meta: T | null | undefined,
  ctx?: TraceContext,
  opts?: TraceMetaOptions,
): (T & TraceMeta) | T | null | undefined {
  if (!ctx) return meta;
  return { ...(meta ?? ({} as T)), ...traceMeta(ctx, opts) };
}

/**
 * The single injection gate used by the ACP path (acp-client). Returns the trace
 * `_meta` fields when tracing is ON, or `undefined` when OFF — so the caller injects
 * NO `_meta` keys at all. Opt-in is enforced here: no context, no carrier.
 */
export function optionalTraceMeta(
  ctx?: TraceContext,
  opts?: TraceMetaOptions,
): Record<string, unknown> | undefined {
  return ctx ? (traceMeta(ctx, opts) as unknown as Record<string, unknown>) : undefined;
}

/** Read a trace context out of an inbound `_meta` (the MCP server's consume side). */
export function extractTraceContext(meta: unknown): TraceContext | null {
  if (!meta || typeof meta !== 'object') return null;
  const tp = (meta as Record<string, unknown>)[TRACE_CONTEXT_KEYS[0]];
  return typeof tp === 'string' ? parseTraceparent(tp) : null;
}
