// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * The TS mirror of the Rust telemetry event model (src-tauri/src/telemetry.rs).
 *
 * BORN-REDACTED BY CONSTRUCTION: this union is the allowlist. There is **no field**
 * for note content, prompts, tool arguments, tool output, file paths, or secrets —
 * only counts, durations, bounded enums, names, and correlation ids. The emission
 * tap can therefore not *construct* an event carrying content; redaction is a
 * property of the type, not a scrub applied afterward.
 *
 * These objects cross to the single writer (`telemetry_record`) verbatim, so the
 * field names are the serde wire names of the Rust enum (tag `kind`, camelCase).
 */

/** Correlation tags carried by session-scoped events (W3C trace ids, hex). */
export interface TraceTag {
  traceId?: string;
  spanId?: string;
}

export interface AgentTurnEvent extends TraceTag {
  kind: 'agent_turn';
  /** A sequence id (e.g. "turn-3") — NEVER the prompt text. */
  turnId: string;
  durationMs: number;
  ok: boolean;
  /** A bounded class (ACP stopReason or an error class name) — never a message. */
  errorType?: string;
  /** Per-turn token usage — set ONLY when ACP reports PromptResponse.usage; omitted
   *  (never 0) otherwise. Counts, not content. */
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmRequestEvent extends TraceTag {
  kind: 'llm_request';
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  finishReason: string;
  errorType?: string;
}

export interface ToolCallEvent extends TraceTag {
  kind: 'tool_call';
  /** The bounded ACP ToolKind enum (read|edit|...) — never the tool title or args. */
  tool: string;
  durationMs: number;
  ok: boolean;
  errorType?: string;
  mcpMethod?: string;
}

export interface SchemaValidationEvent {
  kind: 'schema_validation';
  schema: string;
  rule: string;
  ok: boolean;
}

export interface ReflectionEvent {
  kind: 'reflection';
  outcome: string;
  durationMs: number;
}

export type TelemetryEvent =
  | AgentTurnEvent
  | LlmRequestEvent
  | ToolCallEvent
  | SchemaValidationEvent
  | ReflectionEvent;

/** The single-writer sink. Production impl routes to the `telemetry_record` command. */
export type RecordTelemetry = (event: TelemetryEvent) => void | Promise<void>;
