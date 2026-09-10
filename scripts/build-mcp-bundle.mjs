// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Bundle the Alfred MCP server into one dependency-free CJS file.
 *
 * The shipped desktop app must not depend on `npx tsx` (or any node_modules)
 * existing on the user's machine: the guard points goose's stdio extension at
 * a pinned Node sidecar running THIS bundle (see src-tauri/src/guard.rs,
 * `bundled_mcp_invocation`). esbuild is a dev-only tool; nothing it produces
 * adds to the shipped dependency graph — the output inlines the MCP SDK and
 * Zod.
 *
 * Output is a build artifact (gitignored): src-tauri/mcp-bundle/mcp-server.cjs.
 * Run: `npm run build:mcp`. Wired into tauri.conf.json beforeDevCommand /
 * beforeBuildCommand, exactly like scripts/stage-goose-sidecar.mjs.
 */
import { build } from 'esbuild';
import { mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'src-tauri', 'mcp-bundle');
mkdirSync(outdir, { recursive: true });
const outfile = join(outdir, 'mcp-server.cjs');

await build({
  entryPoints: [join(root, 'mcp', 'run.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: false,
  sourcemap: false,
  // Preserve bundled license notices at end-of-file (MIT SDK/Zod attribution).
  legalComments: 'eof',
  logLevel: 'warning',
});

const kb = (statSync(outfile).size / 1024).toFixed(1);
console.log(`[build-mcp] bundled mcp/run.ts -> ${outfile} (${kb} KB, deps inlined)`);
