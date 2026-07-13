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
import { mkdir, writeTextFile, readTextFile, exists } from '@tauri-apps/plugin-fs';
import {
  buildGooseConfigYaml,
  buildGooseEnv,
  scanGooseConfigText,
  type GooseProviderCreds,
} from './provider-lockdown';
import { buildPermissionYaml, goosePermissionPath } from './tool-gate';

export interface GooseDistribution {
  /** GOOSE_PATH_ROOT — Alfred's isolated goose root under the app config dir. */
  pathRoot: string;
  /** The generated config.yaml path (<pathRoot>/config/config.yaml). */
  configPath: string;
  /** The curated permission.yaml path (<pathRoot>/config/permission.yaml). */
  permissionPath: string;
  /** The locked-down spawn env (provider pinned, keyring off, excluded keys blanked). */
  env: Record<string, string>;
  /** Excluded-vendor warnings from the B5 startup scan (threat-model §5) — surface, never hide. */
  warnings: string[];
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

  // B5 startup scan (threat-model §5): the denylist is default-safe, not
  // tamper-proof. Warn on a pre-existing (possibly hand-edited) config before it
  // is regenerated — never silently rewrite without saying so.
  const warnings: string[] = [];
  if (await exists(configPath)) {
    const previous = await readTextFile(configPath).catch(() => '');
    for (const f of scanGooseConfigText(previous)) {
      warnings.push(
        `Existing goose config line ${f.line} references an excluded vendor (${f.vendor}): "${f.excerpt}". ` +
          `Alfred regenerates this file each session; the entry was NOT carried over.`,
      );
    }
  }

  const yaml = buildGooseConfigYaml({
    creds: opts.creds,
    vaultPath: opts.vaultPath,
    builtins: opts.builtins,
    mcpCommand: opts.mcpCommand,
    mcpArgs: opts.mcpArgs,
  });
  // Writer-regression tripwire: Alfred's own output must never mention an
  // excluded host (an mcpCommand/arg override could smuggle one in).
  for (const f of scanGooseConfigText(yaml)) {
    warnings.push(
      `Generated goose config line ${f.line} references an excluded vendor (${f.vendor}): "${f.excerpt}". ` +
        `This should be impossible — refusing to treat it as normal; check the caller's overrides.`,
    );
  }
  await writeTextFile(configPath, yaml);

  // Curated permission.yaml in the SAME isolated config dir: read-only vault tools
  // always_allow (no prompt-fatigue), every write + the shell surface ask_before.
  const permissionPath = goosePermissionPath(pathRoot);
  await writeTextFile(permissionPath, buildPermissionYaml());

  return { pathRoot, configPath, permissionPath, env: buildGooseEnv(opts.creds, { pathRoot }), warnings };
}
