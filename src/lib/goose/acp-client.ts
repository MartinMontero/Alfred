// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * goose ACP client (desktop / Tauri).
 *
 * Spawns the bundled `goose acp` sidecar and drives it as an ACP **agent** over
 * stdio. Alfred is the ACP **client** ([ClientSideConnection]). The sidecar's raw
 * stdout/stdin are bridged into the Web streams `ndJsonStream` expects.
 *
 * Lifecycle: every spawned child is tracked and killed on app exit (window close
 * or reload) so a long-lived `goose acp` server can never be orphaned.
 *
 * This module is desktop-only — it imports `@tauri-apps/plugin-shell`. Gate its
 * use behind `platform.info.is_web === false`.
 */

import { Command, type Child } from '@tauri-apps/plugin-shell';
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
import type { GooseProviderCreds } from './provider-lockdown';
import { buildGooseEnv } from './provider-lockdown';

/** Stem of the sidecar declared in tauri.conf.json `externalBin`. */
export const GOOSE_SIDECAR = 'binaries/goose';

// --- kill-on-exit registry -------------------------------------------------

const liveChildren = new Set<Child>();
let exitHooksInstalled = false;

async function killAllGooseChildren(): Promise<void> {
  const children = [...liveChildren];
  liveChildren.clear();
  await Promise.allSettled(children.map((c) => c.kill()));
}

function installExitHooks(): void {
  if (exitHooksInstalled || typeof window === 'undefined') return;
  exitHooksInstalled = true;
  // Reloads / navigations.
  window.addEventListener('beforeunload', () => {
    void killAllGooseChildren();
  });
  // Native window close. Imported lazily so the web bundle never pulls it in.
  void import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) =>
      getCurrentWindow().onCloseRequested(async () => {
        await killAllGooseChildren();
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
  creds: GooseProviderCreds;
  /** Working directory for the session (absolute) — typically the vault root. */
  cwd: string;
  /** Isolated goose root (GOOSE_PATH_ROOT) so Alfred never touches the user's config. */
  pathRoot?: string;
  /** ACP-native MCP servers. The vault is normally registered via the config.yaml
   *  extension instead; pass servers here only for ad-hoc, session-scoped registration. */
  mcpServers?: McpServer[];
  handlers?: GooseSessionHandlers;
  /** Extra env merged into the spawn (excluded-vendor keys are still blanked). */
  extraEnv?: Record<string, string>;
  /** Initialize timeout (ms). */
  timeoutMs?: number;
  /** Session permission mode. Default 'approve' (deterministic gate). NEVER 'auto'
   *  (bypasses the gate) or 'smart_approve' (adds an LLM inference step). */
  mode?: string;
}

export interface GooseSession {
  readonly sessionId: string;
  readonly initialize: InitializeResponse;
  prompt(text: string): Promise<PromptResponse>;
  cancel(): Promise<void>;
  kill(): Promise<void>;
  readonly closed: Promise<void>;
}

const decoder = new TextDecoder();

/**
 * Start a goose ACP session: spawn the sidecar, initialize, and create a session.
 * Refuses to launch if the provider/model resolves to an excluded vendor (the env
 * builder throws), so Alfred can never drive goose against Meta/OpenAI/xAI.
 */
export async function startGooseSession(opts: GooseSessionOptions): Promise<GooseSession> {
  installExitHooks();

  // buildGooseEnv throws ProviderNotAllowedError for an excluded provider/model.
  const env = buildGooseEnv(opts.creds, { pathRoot: opts.pathRoot, extra: opts.extraEnv });

  const command = Command.sidecar(GOOSE_SIDECAR, ['acp'], {
    encoding: 'raw',
    cwd: opts.cwd,
    env,
  });

  if (opts.handlers?.onStderr) {
    command.stderr.on('data', (bytes: Uint8Array) => {
      opts.handlers?.onStderr?.(decoder.decode(bytes));
    });
  }

  // Bridge the sidecar's stdout into a Web ReadableStream<Uint8Array>. Listeners
  // are attached before spawn so no early bytes are lost.
  let closedResolve!: () => void;
  const closed = new Promise<void>((r) => {
    closedResolve = r;
  });
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      command.stdout.on('data', (bytes: Uint8Array) => {
        try {
          controller.enqueue(bytes);
        } catch {
          /* stream already closed */
        }
      });
      command.on('close', () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        opts.handlers?.onClosed?.();
        closedResolve();
      });
      command.on('error', (err) => {
        try {
          controller.error(err);
        } catch {
          /* already errored */
        }
      });
    },
  });

  const child = await command.spawn();
  liveChildren.add(child);

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      return child.write(chunk);
    },
  });

  const stream: Stream = ndJsonStream(writable, readable);

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
    liveChildren.delete(child);
    await child.kill().catch(() => {
      /* already gone */
    });
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

    const session = await Promise.resolve(
      conn.newSession({ cwd: opts.cwd, mcpServers: opts.mcpServers ?? [] }),
    );

    // Take the session OFF goose's default 'auto' mode so every write/shell tool
    // call routes through the client's permission gate. The handshake returns
    // 'auto', so config alone is not trusted — the mode is applied at runtime here.
    // Fail closed: if it cannot be applied, the session is not used.
    const mode = opts.mode ?? 'approve';
    await Promise.resolve(conn.setSessionMode({ sessionId: session.sessionId, modeId: mode }));

    return {
      sessionId: session.sessionId,
      initialize,
      prompt: (text: string) =>
        Promise.resolve(
          conn.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text }] }),
        ),
      cancel: () => Promise.resolve(conn.cancel({ sessionId: session.sessionId })),
      kill,
      closed,
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

/** Track a child so it is killed on app exit (used by the recipe runner too). */
export function trackGooseChild(child: Child): void {
  installExitHooks();
  liveChildren.add(child);
}

/** Stop tracking a child (e.g. after it exits on its own). */
export function untrackGooseChild(child: Child): void {
  liveChildren.delete(child);
}

/** Kill any live goose children — exposed for explicit teardown (e.g. on logout). */
export { killAllGooseChildren };
