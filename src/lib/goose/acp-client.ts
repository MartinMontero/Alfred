// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * goose ACP client (desktop / Tauri).
 *
 * Drives a guarded `goose acp` child as an ACP **agent** over stdio. Alfred is
 * the ACP **client** ([ClientSideConnection]). The child is created in Rust
 * behind `holmes_guard::spawn::sanitized_spawn` (L2) and rides the L1a egress
 * proxy — see `guard-transport.ts`. This module never spawns a process itself
 * and holds no provider policy: the guard is the single authority (ADR-0008).
 *
 * Lifecycle: every guarded child is killed on app exit (window close or reload)
 * so a long-lived `goose acp` server can never be orphaned.
 *
 * Desktop-only — gate its use behind `platform.info.is_web === false`.
 */

import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type Stream,
  type McpServer,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type InitializeResponse,
  type PromptResponse,
} from '@agentclientprotocol/sdk';
import { spawnGuardedGoose, killAllGuardedGoose, type GuardCreds, type GuardTransport } from './guard-transport';
import { optionalTraceMeta, type TraceContext } from '../telemetry/trace';

// --- kill-on-exit hooks ------------------------------------------------------
// The authoritative kill switch is Rust (`guard_goose_kill_all`, plus the
// Windows Job Object backstop). These hooks trigger it on the web-lifecycle
// events Rust cannot see.

let exitHooksInstalled = false;

function installExitHooks(): void {
  if (exitHooksInstalled || typeof window === 'undefined') return;
  exitHooksInstalled = true;
  window.addEventListener('beforeunload', () => {
    void killAllGuardedGoose();
  });
  void import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) =>
      getCurrentWindow().onCloseRequested(async () => {
        await killAllGuardedGoose();
      }),
    )
    .catch(() => {
      /* not in a Tauri window — beforeunload still covers reloads */
    });
}

// --- session ----------------------------------------------------------------

export interface GooseSessionHandlers {
  /** Streaming updates from the agent (message chunks, tool calls, plans). */
  onSessionUpdate?: (update: SessionNotification) => void;
  /** Permission gate for tool calls. Default: deny (secure by default). */
  onRequestPermission?: (req: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
  /** Raw stderr text from the goose process (diagnostics / xterm). */
  onStderr?: (text: string) => void;
  /** Called once the underlying connection closes. */
  onClosed?: () => void;
}

export interface GooseSessionOptions {
  creds: GuardCreds;
  /** Working directory for the session (absolute) — typically the vault root. */
  cwd: string;
  /** Absolute vault root the MCP server serves (registered as the guard config's stdio extension). */
  vaultPath: string;
  /** Builtin goose extensions to enable (e.g. subagent support). */
  builtins?: string[];
  /** ACP-native MCP servers for ad-hoc, session-scoped registration. */
  mcpServers?: McpServer[];
  handlers?: GooseSessionHandlers;
  /** Extra env merged in Rust (refused there if provider-selecting). */
  extraEnv?: Record<string, string>;
  /** Initialize timeout (ms). */
  timeoutMs?: number;
  /** Session permission mode. Default 'approve' (deterministic gate). NEVER 'auto'
   *  (bypasses the gate) or 'smart_approve' (adds an LLM inference step). */
  mode?: string;
  /** W3C trace context for the session (SEP-414). When present, its traceparent is
   *  injected into ACP newSession/prompt _meta. Omit to disable tracing (opt-in). */
  traceContext?: TraceContext;
  /** OPT-IN OTLP endpoint forwarded to goose (default: goose OTel off). */
  otelEndpoint?: string;
}

export interface GooseSession {
  readonly sessionId: string;
  /** The session's W3C trace id, if tracing is enabled — tag telemetry events with this. */
  readonly traceId?: string;
  /** Guard-resolved provider/model actually used (normalized). */
  readonly provider: string;
  readonly model: string;
  /** B5 config-scan warnings from the guarded distribution — surface, never hide. */
  readonly warnings: string[];
  readonly initialize: InitializeResponse;
  prompt(text: string): Promise<PromptResponse>;
  cancel(): Promise<void>;
  kill(): Promise<void>;
  readonly closed: Promise<void>;
}

/**
 * Start a guarded goose ACP session: spawn through the Rust guard, initialize,
 * and create a session. The guard refuses to launch if the provider/model
 * resolves to an excluded or unknown id (L1b), so Alfred can never drive goose
 * against Meta/OpenAI/xAI — or anything off the permitted roster.
 */
export async function startGooseSession(opts: GooseSessionOptions): Promise<GooseSession> {
  installExitHooks();

  // The Rust guard prepares the isolated distribution, resolves L1b, builds the
  // L2 sanitized command, and starts streaming. Throws for a denied provider/model.
  let transport: GuardTransport;
  try {
    transport = await spawnGuardedGoose({
      creds: opts.creds,
      cwd: opts.cwd,
      vaultPath: opts.vaultPath,
      builtins: opts.builtins,
      otelEndpoint: opts.otelEndpoint,
      extraEnv: opts.extraEnv,
      onStderr: (t) => opts.handlers?.onStderr?.(t),
    });
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }

  transport.closed.then(() => opts.handlers?.onClosed?.());

  const stream: Stream = ndJsonStream(transport.writable, transport.readable);

  const client: Client = {
    sessionUpdate: (params) => {
      opts.handlers?.onSessionUpdate?.(params);
    },
    requestPermission: async (req) => {
      if (opts.handlers?.onRequestPermission) return opts.handlers.onRequestPermission(req);
      // Secure default: deny (cancel) any tool-call permission request.
      return { outcome: { outcome: 'cancelled' } };
    },
  };

  // Concrete connection type (not the Agent interface) so setSessionMode is available.
  const conn = new ClientSideConnection(() => client, stream);

  const kill = async (): Promise<void> => {
    await transport.kill();
  };

  try {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const initialize = await withTimeout(
      Promise.resolve(
        conn.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
          clientInfo: { name: 'alfred', version: '0.1.0' },
        }),
      ),
      timeoutMs,
      'goose initialize',
    );

    // SEP-414 cross-stack correlation: carry the session's W3C trace context in the
    // ACP _meta of newSession/prompt, so goose receives the same trace id. The gate
    // is optionalTraceMeta — no trace context, no _meta injected (opt-in inert).
    const traceMetaObj = optionalTraceMeta(opts.traceContext);

    const session = await Promise.resolve(
      conn.newSession({
        cwd: opts.cwd,
        mcpServers: opts.mcpServers ?? [],
        ...(traceMetaObj ? { _meta: traceMetaObj } : {}),
      }),
    );

    // Take the session OFF goose's default 'auto' mode so every write/shell tool
    // call routes through the client's permission gate. The handshake returns
    // 'auto', so config alone is not trusted — the mode is applied at runtime here.
    // Fail closed: if it cannot be applied, the session is not used.
    const mode = opts.mode ?? 'approve';
    await Promise.resolve(conn.setSessionMode({ sessionId: session.sessionId, modeId: mode }));

    return {
      sessionId: session.sessionId,
      traceId: opts.traceContext?.traceId,
      provider: transport.provider,
      model: transport.model,
      warnings: transport.warnings,
      initialize,
      prompt: (text: string) =>
        Promise.resolve(
          conn.prompt({
            sessionId: session.sessionId,
            prompt: [{ type: 'text', text }],
            ...(traceMetaObj ? { _meta: traceMetaObj } : {}),
          }),
        ),
      cancel: () => Promise.resolve(conn.cancel({ sessionId: session.sessionId })),
      kill,
      closed: transport.closed,
    };
  } catch (err) {
    await kill();
    throw err;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Kill any live goose children — exposed for explicit teardown (e.g. on logout). */
export { killAllGuardedGoose as killAllGooseChildren };
