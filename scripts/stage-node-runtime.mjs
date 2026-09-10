// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Stage a pinned Node.js runtime as the MCP-server sidecar.
 *
 * The shipped MCP server is a pre-bundled CJS file (scripts/build-mcp-bundle.mjs)
 * executed by THIS pinned runtime — the shipped path never touches `npx`/`tsx`
 * or the user's own Node install. Mirrors scripts/stage-goose-sidecar.mjs:
 * Tauri's `externalBin: ["binaries/node"]` expects `binaries/node-<triple>[.exe]`.
 *
 * Local dev: stages the installed Node (soft version check — a mismatch warns
 * but never blocks, so a web-only or docs workflow still works). The RELEASE
 * lane downloads the pinned Node from nodejs.org and passes --require.
 *
 * Run: `npm run stage:node` (or `node scripts/stage-node-runtime.mjs --require`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

const REQUIRE = process.argv.includes('--require');
const IS_WIN = platform() === 'win32';
const EXE = IS_WIN ? '.exe' : '';

// The Node version Alfred ships against. Node 22 LTS per the toolchain table
// (engines: >=22.12). Verified against https://nodejs.org/dist/index.json on
// 2026-09-09. Bump in its own commit with the trio of gates re-run.
const EXPECTED_NODE_VERSION = '22.23.2';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const binariesDir = join(root, 'src-tauri', 'binaries');

function fail(msg) {
  if (REQUIRE) {
    console.error(`[stage-node] ERROR: ${msg}`);
    process.exit(1);
  }
  console.warn(`[stage-node] SKIP: ${msg}`);
  console.warn('[stage-node] The packaged app needs this sidecar for the bundled MCP server — re-run before tauri build.');
  process.exit(0);
}

function hostTriple() {
  try {
    return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
  } catch {
    /* fall through */
  }
  try {
    const vv = execFileSync('rustc', ['-Vv'], { encoding: 'utf8' });
    const m = vv.match(/^host:\s*(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* rustc not found */
  }
  return null;
}

function findNode() {
  if (process.env.NODE_BIN && existsSync(process.env.NODE_BIN)) return process.env.NODE_BIN;
  const candidates = IS_WIN
    ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe')]
    : [join(homedir(), '.local', 'bin', 'node'), '/usr/local/bin/node', '/usr/bin/node'];
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    const which = IS_WIN ? 'where' : 'which';
    const out = execFileSync(which, ['node'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    if (out && existsSync(out)) return out;
  } catch {
    /* not on PATH */
  }
  return null;
}

function checkNodeVersion(bin) {
  try {
    const out = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim().replace(/^v/, '');
    if (out !== EXPECTED_NODE_VERSION) {
      console.warn(
        `[stage-node] WARNING: staged node is ${out}, Alfred pins ${EXPECTED_NODE_VERSION} (the release lane stages the pinned download; local staging uses the installed runtime).`,
      );
    } else {
      console.log(`[stage-node] node ${out} matches the pin.`);
    }
  } catch {
    console.warn('[stage-node] could not read node --version (staging anyway).');
  }
}

const triple = hostTriple();
if (!triple) fail('could not determine the Rust host triple (is rustc installed?).');

const source = findNode();
if (!source) fail('could not find a node binary (set NODE_BIN, or install Node 22 LTS).');

checkNodeVersion(source);

const target = join(binariesDir, `node-${triple}${EXE}`);
mkdirSync(binariesDir, { recursive: true });

if (existsSync(target) && statSync(target).size === statSync(source).size) {
  console.log(`[stage-node] up to date: ${target}`);
  process.exit(0);
}

copyFileSync(source, target);
console.log(`[stage-node] staged ${source}`);
console.log(`[stage-node]      -> ${target}`);
