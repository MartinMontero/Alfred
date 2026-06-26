// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * goose recipes (desktop / Tauri).
 *
 * Recipes are YAML files (see goose-recipes/). Alfred lets the builder author a
 * recipe (it is a note editor), validate it with `goose recipe validate`, and run
 * it with `goose run --recipe`, streaming output to the chat panel + terminal.
 * Recipe runs go through the same locked-down env as ACP sessions, so a recipe
 * can never reach an excluded vendor.
 */

import { Command, type Child } from '@tauri-apps/plugin-shell';
import { GOOSE_SIDECAR, trackGooseChild, untrackGooseChild } from './acp-client';
import { buildGooseEnv, type GooseProviderCreds } from './provider-lockdown';

export interface RecipeValidation {
  valid: boolean;
  output: string;
}

/** Validate a recipe file with `goose recipe validate <path>` via the sidecar. */
export async function validateRecipe(recipePath: string): Promise<RecipeValidation> {
  const cmd = Command.sidecar(GOOSE_SIDECAR, ['recipe', 'validate', recipePath]);
  const res = await cmd.execute();
  const output = [res.stdout, res.stderr].filter(Boolean).join('\n').trim();
  return { valid: res.code === 0, output };
}

export interface RunRecipeOptions {
  creds: GooseProviderCreds;
  /** Working directory (vault root, absolute). */
  cwd: string;
  /** Isolated goose root (GOOSE_PATH_ROOT). */
  pathRoot?: string;
  /** Streamed stdout+stderr text (wire to the chat panel / xterm terminal). */
  onOutput?: (text: string) => void;
}

export interface RecipeRun {
  child: Child;
  /** Resolves with the process exit code when the recipe finishes. */
  done: Promise<number | null>;
  kill(): Promise<void>;
}

/**
 * Run a recipe non-interactively with `goose run --recipe <path> --no-session`,
 * streaming output. The child is tracked for kill-on-exit.
 */
export async function runRecipe(recipePath: string, opts: RunRecipeOptions): Promise<RecipeRun> {
  // buildGooseEnv throws for an excluded provider/model — a recipe cannot escape the denylist.
  const env = buildGooseEnv(opts.creds, { pathRoot: opts.pathRoot });
  const cmd = Command.sidecar(GOOSE_SIDECAR, ['run', '--recipe', recipePath, '--no-session'], {
    encoding: 'raw',
    cwd: opts.cwd,
    env,
  });

  const decoder = new TextDecoder();
  if (opts.onOutput) {
    cmd.stdout.on('data', (b: Uint8Array) => opts.onOutput?.(decoder.decode(b)));
    cmd.stderr.on('data', (b: Uint8Array) => opts.onOutput?.(decoder.decode(b)));
  }

  let resolveDone!: (code: number | null) => void;
  const done = new Promise<number | null>((r) => {
    resolveDone = r;
  });

  const child = await cmd.spawn();
  trackGooseChild(child);
  cmd.on('close', (data) => {
    untrackGooseChild(child);
    resolveDone(data.code);
  });

  return {
    child,
    done,
    kill: async () => {
      untrackGooseChild(child);
      await child.kill().catch(() => {
        /* already gone */
      });
    },
  };
}
