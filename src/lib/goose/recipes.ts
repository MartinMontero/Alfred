// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * goose recipes (desktop / Tauri).
 *
 * Recipes are YAML files (see goose-recipes/). Alfred lets the builder author a
 * recipe (it is a note editor), validate it with `goose recipe validate`, and run
 * it with `goose run --recipe`. Both go through the Rust guard (ADR-0008): the
 * same `sanitized_spawn` (L2) + L1a proxy as an ACP session, so a recipe can
 * never reach an excluded/unknown provider. The Pale Fire safety scan + clean
 * staging stay TS-side (separate from provider policy).
 */

import { invoke, Channel } from '@tauri-apps/api/core';
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { toUint8Array } from './stdio-bytes';
import type { GuardCreds } from './guard-transport';
import {
  scanRecipe,
  stageCleanRecipe,
  scanHasWarnings,
  type RecipeScan,
  type ReadFile,
  type WriteFile,
} from './recipe-scan';

export interface RecipeValidation {
  valid: boolean;
  output: string;
}

/** Validate a recipe file with `goose recipe validate <path>` through the guard. */
export async function validateRecipe(
  creds: Pick<GuardCreds, 'provider' | 'model'>,
  recipePath: string,
): Promise<RecipeValidation> {
  return invoke<RecipeValidation>('guard_goose_recipe_validate', {
    provider: creds.provider,
    model: creds.model,
    recipePath,
  });
}

// --- Pale Fire safety scan (Step 1) -----------------------------------------

const tauriRead: ReadFile = (p) => readTextFile(p);
const tauriWrite: WriteFile = async (p, content) => {
  const dir = p.replace(/[/\\][^/\\]*$/, '');
  if (dir && !(await exists(dir))) await mkdir(dir, { recursive: true });
  await writeTextFile(p, content);
};

/** Read + sanitize a recipe (and its sub-recipes) and enumerate its action
 *  surface. The UI calls this to render the pre-flight preview before any run. */
export function scanRecipeFile(recipePath: string): Promise<RecipeScan> {
  return scanRecipe(recipePath, tauriRead);
}

/** Thrown when {@link runRecipe} is asked to run a recipe whose safety warnings
 *  have not been explicitly acknowledged. */
export class RecipeBlockedError extends Error {
  constructor(message = 'Recipe has unacknowledged safety warnings; run blocked.') {
    super(message);
    this.name = 'RecipeBlockedError';
  }
}

type GooseIoEvent =
  | { type: 'stdout'; data: number[] }
  | { type: 'stderr'; data: number[] }
  | { type: 'closed'; code: number | null };

interface SpawnedGoose {
  id: number;
}

export interface RunRecipeOptions {
  creds: GuardCreds;
  /** Working directory (vault root, absolute). */
  cwd: string;
  /** Isolated goose root (GOOSE_PATH_ROOT); recipes stage a cleaned copy under it. */
  pathRoot: string;
  /** Streamed stdout+stderr text (wire to the chat panel / xterm terminal). */
  onOutput?: (text: string) => void;
  /** Operator has acknowledged the pre-flight preview/warnings. Required to run a
   *  recipe carrying any high-severity warning. */
  acknowledged?: boolean;
}

export interface RecipeRun {
  /** Resolves with the process exit code when the recipe finishes. */
  done: Promise<number | null>;
  kill(): Promise<void>;
}

const decoder = new TextDecoder();

/**
 * Run a recipe non-interactively through the guard. Re-scans for safety (defense
 * in depth): refuses if any high-severity warning is unacknowledged, then stages
 * a **fully-cleaned** copy of the recipe tree and runs goose against that — so
 * the executed recipe is guaranteed free of invisible/deceptive characters.
 * Streams output; the child is guard-tracked for kill-on-exit.
 */
export async function runRecipe(recipePath: string, opts: RunRecipeOptions): Promise<RecipeRun> {
  // Safety gate: scan, refuse unacknowledged warnings, run on cleaned content.
  const scan = await scanRecipeFile(recipePath);
  if (scanHasWarnings(scan) && !opts.acknowledged) {
    throw new RecipeBlockedError();
  }
  const stageDir = `${opts.pathRoot.replace(/\\/g, '/')}/recipe-stage`;
  const staged = await stageCleanRecipe(scan, stageDir, tauriRead, tauriWrite);

  let resolveDone!: (code: number | null) => void;
  const done = new Promise<number | null>((r) => {
    resolveDone = r;
  });

  const channel = new Channel<GooseIoEvent>();
  channel.onmessage = (event) => {
    switch (event.type) {
      case 'stdout':
      case 'stderr':
        opts.onOutput?.(decoder.decode(toUint8Array(event.data)));
        break;
      case 'closed':
        resolveDone(event.code);
        break;
    }
  };

  // guard_goose_recipe_run refuses an excluded/unknown provider/model in Rust.
  const spawned = await invoke<SpawnedGoose>('guard_goose_recipe_run', {
    args: {
      provider: opts.creds.provider,
      model: opts.creds.model,
      apiKey: opts.creds.apiKey,
      ollamaHost: opts.creds.ollamaHost,
      cwd: opts.cwd,
      stagedRecipePath: staged.parentPath,
    },
    onEvent: channel,
  });

  return {
    done,
    kill: async () => {
      await invoke('guard_goose_kill', { id: spawned.id }).catch(() => {
        /* already gone */
      });
    },
  };
}
