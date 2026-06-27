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
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { GOOSE_SIDECAR, trackGooseChild, untrackGooseChild } from './acp-client';
import { buildGooseEnv, type GooseProviderCreds } from './provider-lockdown';
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

/** Validate a recipe file with `goose recipe validate <path>` via the sidecar. */
export async function validateRecipe(recipePath: string): Promise<RecipeValidation> {
  const cmd = Command.sidecar(GOOSE_SIDECAR, ['recipe', 'validate', recipePath]);
  const res = await cmd.execute();
  const output = [res.stdout, res.stderr].filter(Boolean).join('\n').trim();
  return { valid: res.code === 0, output };
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

export interface RunRecipeOptions {
  creds: GooseProviderCreds;
  /** Working directory (vault root, absolute). */
  cwd: string;
  /** Isolated goose root (GOOSE_PATH_ROOT). */
  pathRoot?: string;
  /** Streamed stdout+stderr text (wire to the chat panel / xterm terminal). */
  onOutput?: (text: string) => void;
  /** Operator has acknowledged the pre-flight preview/warnings. Required to run a
   *  recipe carrying any high-severity warning. */
  acknowledged?: boolean;
}

export interface RecipeRun {
  child: Child;
  /** Resolves with the process exit code when the recipe finishes. */
  done: Promise<number | null>;
  kill(): Promise<void>;
}

/**
 * Run a recipe non-interactively. Re-scans for safety (defense in depth): refuses
 * if any high-severity warning is unacknowledged, then stages a **fully-cleaned**
 * copy of the recipe tree and runs goose against that — so the executed recipe is
 * guaranteed free of invisible/deceptive characters. Streams output; the child is
 * tracked for kill-on-exit.
 */
export async function runRecipe(recipePath: string, opts: RunRecipeOptions): Promise<RecipeRun> {
  // buildGooseEnv throws for an excluded provider/model — a recipe cannot escape the denylist.
  const env = buildGooseEnv(opts.creds, { pathRoot: opts.pathRoot });

  // Safety gate: scan, refuse unacknowledged warnings, run on cleaned content.
  const scan = await scanRecipeFile(recipePath);
  if (scanHasWarnings(scan) && !opts.acknowledged) {
    throw new RecipeBlockedError();
  }
  const stageDir = `${(opts.pathRoot ?? opts.cwd).replace(/\\/g, '/')}/recipe-stage`;
  const staged = await stageCleanRecipe(scan, stageDir, tauriRead, tauriWrite);

  const cmd = Command.sidecar(GOOSE_SIDECAR, ['run', '--recipe', staged.parentPath, '--no-session'], {
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
