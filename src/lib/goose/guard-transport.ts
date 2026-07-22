// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Guarded goose spawn transport (desktop / Tauri) — ADR-0008.
 *
 * Every goose process is now created in Rust behind `holmes_guard::spawn::
 * sanitized_spawn` (L2) and rides the in-process L1a egress proxy. This module
 * bridges those Rust commands into the Web streams the ACP `ClientSideConnection`
 * expects: stdout arrives over a Tauri `Channel`, stdin is written with
 * `guard_goose_write`. No policy logic lives here — the guard is the authority;
 * this is transport only.
 */

import { invoke, Channel } from '@tauri-apps/api/core';
import { toUint8Array } from './stdio-bytes';

/** A permitted provider/model pair and its BYOK credential, for a guarded spawn. */
export interface GuardCreds {
  /** A guard-permitted provider id (refused in Rust if it resolves to an excluded/unknown id). */
  provider: string;
  /** A model in the provider's permitted family (refused otherwise). */
  model: string;
  /** API key for a hosted provider — passed to Rust, forwarded to goose via env only. */
  apiKey?: string;
  /** Ollama host for the local provider (e.g. http://localhost:11434). */
  ollamaHost?: string;
}

/** Events the Rust guard streams for a live goose child. */
type GooseIoEvent =
  | { type: 'stdout'; data: number[] }
  | { type: 'stderr'; data: number[] }
  | { type: 'closed'; code: number | null };

interface SpawnedGoose {
  id: number;
  provider: string;
  model: string;
  warnings: string[];
  pathRoot: string;
}

export interface GuardTransport {
  /** Guard-resolved provider (normalized). */
  readonly provider: string;
  readonly model: string;
  /** B5 startup-scan warnings from config preparation — surface, never hide. */
  readonly warnings: string[];
  /** The isolated goose root the session runs under. */
  readonly pathRoot: string;
  /** The Web stream pair for `ndJsonStream`. */
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  /** Resolves when the child closes. */
  readonly closed: Promise<void>;
  kill(): Promise<void>;
}

export interface GuardSpawnOptions {
  creds: GuardCreds;
  /** Working directory (absolute) — typically the vault root. */
  cwd: string;
  /** Absolute vault root the MCP server should serve. */
  vaultPath: string;
  /** Builtin goose extensions to enable (e.g. a subagent builtin). */
  builtins?: string[];
  /** OPT-IN OTLP endpoint; when omitted goose's OTel stays off. */
  otelEndpoint?: string;
  /** Extra env merged in Rust — refused there if provider-selecting. */
  extraEnv?: Record<string, string>;
  onStderr?: (text: string) => void;
}

const decoder = new TextDecoder();

/**
 * Spawn a guarded `goose acp` session and expose it as Web streams. The Rust
 * command prepares the isolated distribution, resolves through L1b, builds the
 * L2 sanitized command, and starts streaming — all before this resolves.
 */
export async function spawnGuardedGoose(opts: GuardSpawnOptions): Promise<GuardTransport> {
  let closedResolve!: () => void;
  const closed = new Promise<void>((r) => {
    closedResolve = r;
  });

  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });

  const channel = new Channel<GooseIoEvent>();
  channel.onmessage = (event) => {
    switch (event.type) {
      case 'stdout':
        try {
          controllerRef?.enqueue(toUint8Array(event.data));
        } catch {
          /* stream already closed */
        }
        break;
      case 'stderr':
        opts.onStderr?.(decoder.decode(toUint8Array(event.data)));
        break;
      case 'closed':
        try {
          controllerRef?.close();
        } catch {
          /* already closed */
        }
        closedResolve();
        break;
    }
  };

  const spawned = await invoke<SpawnedGoose>('guard_spawn_goose', {
    args: {
      provider: opts.creds.provider,
      model: opts.creds.model,
      apiKey: opts.creds.apiKey,
      ollamaHost: opts.creds.ollamaHost,
      cwd: opts.cwd,
      vaultPath: opts.vaultPath,
      builtins: opts.builtins,
      mcpCommand: null,
      mcpArgs: null,
      extraEnv: opts.extraEnv ?? null,
      otelEndpoint: opts.otelEndpoint ?? null,
    },
    onEvent: channel,
  });

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      await invoke('guard_goose_write', { id: spawned.id, data: Array.from(chunk) });
    },
  });

  return {
    provider: spawned.provider,
    model: spawned.model,
    warnings: spawned.warnings,
    pathRoot: spawned.pathRoot,
    readable,
    writable,
    closed,
    kill: async () => {
      await invoke('guard_goose_kill', { id: spawned.id }).catch(() => {
        /* already gone */
      });
    },
  };
}

/** Kill every live guarded goose child (window close / reload). */
export async function killAllGuardedGoose(): Promise<void> {
  await invoke('guard_goose_kill_all').catch(() => {
    /* nothing live */
  });
}

/** A guard-permitted provider, as the crate roster advertises it (UI reads, never enforces). */
export interface GuardProviderInfo {
  id: string;
  modelFamilies: string[];
  credentialEnv: string | null;
  needsApiKey: boolean;
}

/** Read the permitted provider roster from the compiled crate. */
export function guardPermittedProviders(): Promise<GuardProviderInfo[]> {
  return invoke<GuardProviderInfo[]>('guard_permitted_providers');
}

/** L1b pre-flight: resolve a provider/model pair, surfacing a denial before spawn. */
export function guardResolve(provider: string, model: string): Promise<{ provider: string; model: string }> {
  return invoke<{ provider: string; model: string }>('guard_resolve', { provider, model });
}
