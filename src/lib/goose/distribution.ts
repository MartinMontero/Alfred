// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Alfred's custom goose distribution (desktop / Tauri).
 *
 * goose ships with every provider compiled in (OpenAI/xAI/Codex included — no
 * fork). Alfred makes them unreachable by running goose under an **isolated
 * GOOSE_PATH_ROOT** with an Alfred-generated `config.yaml` that (a) pins a
 * permitted provider/model and (b) registers the Alfred vault MCP server as a
 * stdio extension. Using GOOSE_PATH_ROOT means Alfred never reads or overwrites
 * the user's shared `%APPDATA%\Block\goose` config (Rule 9 — no silent clobber).
 *
 * Keys are never written here — they are passed via env at spawn time.
 */

import { appConfigDir, join } from '@tauri-apps/api/path';
import { mkdir, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { buildGooseConfigYaml, buildGooseEnv, type GooseProviderCreds } from './provider-lockdown';

export interface GooseDistribution {
  /** GOOSE_PATH_ROOT — Alfred's isolated goose root under the app config dir. */
  pathRoot: string;
  /** The generated config.yaml path (<pathRoot>/config/config.yaml). */
  configPath: string;
  /** The locked-down spawn env (provider pinned, keyring off, excluded keys blanked). */
  env: Record<string, string>;
}

export interface PrepareGooseOptions {
  creds: GooseProviderCreds;
  /** Absolute vault root the MCP server should serve. */
  vaultPath: string;
  /** Builtin extensions to enable (e.g. a subagent builtin). Default: none. */
  builtins?: string[];
  /** Override the MCP launch command/args (default: npx tsx <vault>/mcp/run.ts <vault>). */
  mcpCommand?: string;
  mcpArgs?: string[];
}

/**
 * Write Alfred's isolated, locked-down goose distribution and return the spawn
 * env. Refuses (via the lockdown builders) if the provider/model is excluded.
 */
export async function prepareGooseDistribution(opts: PrepareGooseOptions): Promise<GooseDistribution> {
  const pathRoot = await join(await appConfigDir(), 'goose');
  const configDir = await join(pathRoot, 'config');
  const configPath = await join(configDir, 'config.yaml');

  if (!(await exists(configDir))) await mkdir(configDir, { recursive: true });

  const yaml = buildGooseConfigYaml({
    creds: opts.creds,
    vaultPath: opts.vaultPath,
    builtins: opts.builtins,
    mcpCommand: opts.mcpCommand,
    mcpArgs: opts.mcpArgs,
  });
  await writeTextFile(configPath, yaml);

  return { pathRoot, configPath, env: buildGooseEnv(opts.creds, { pathRoot }) };
}
