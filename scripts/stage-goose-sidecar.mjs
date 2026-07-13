// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Stage the locally-installed goose binary as the Tauri sidecar.
 *
 * Tauri's `externalBin: ["binaries/goose"]` expects a per-target file named
 * `binaries/goose-<host-triple>[.exe]`. This script computes the host triple via
 * rustc, appends `.exe` on Windows, locates the installed goose binary, and
 * copies it into `src-tauri/binaries/`.
 *
 * Run automatically before `tauri build`/`tauri dev` (see package.json), or
 * manually: `node scripts/stage-goose-sidecar.mjs`.
 *
 * Non-fatal by default: if goose is not installed it warns and exits 0 so a
 * web-only build still works. Pass `--require` to hard-fail instead.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

const REQUIRE = process.argv.includes('--require');
const IS_WIN = platform() === 'win32';
const EXE = IS_WIN ? '.exe' : '';

// The goose version Alfred targets. A SHA-256 pin is Stage-E (E4) work; for now
// this is a SOFT check — a mismatch warns (so a re-stage against the wrong
// version is visible) but never blocks. Bump this constant when the harness
// version decision changes, and re-run the live-goose trio on Windows.
const EXPECTED_GOOSE_VERSION = '1.41.0';

function checkGooseVersion(bin) {
  try {
    const out = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
    const m = out.match(/(\d+\.\d+\.\d+)/);
    const found = m ? m[1] : out;
    if (found !== EXPECTED_GOOSE_VERSION) {
      console.warn(
        `[stage-goose] WARNING: staged goose is ${found}, Alfred targets ${EXPECTED_GOOSE_VERSION}. ` +
          'Re-run the live-goose tests (permission-startup, acp-handshake, recipes.live) after any version change.',
      );
    } else {
      console.log(`[stage-goose] goose ${found} matches the target.`);
    }
  } catch {
    console.warn('[stage-goose] could not read goose --version (staging anyway).');
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const binariesDir = join(root, 'src-tauri', 'binaries');

function fail(msg) {
  if (REQUIRE) {
    console.error(`[stage-goose] ERROR: ${msg}`);
    process.exit(1);
  }
  console.warn(`[stage-goose] SKIP: ${msg}`);
  console.warn('[stage-goose] The Tauri app needs this sidecar at runtime — install goose, then re-run.');
  process.exit(0);
}

function hostTriple() {
  // Rust >= 1.84 supports the stable `--print host-tuple`.
  try {
    return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
  } catch {
    /* fall through to the older `-Vv` form */
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

function findGoose() {
  if (process.env.GOOSE_BIN && existsSync(process.env.GOOSE_BIN)) return process.env.GOOSE_BIN;
  const candidates = [
    join(homedir(), '.local', 'bin', `goose${EXE}`),
    join(homedir(), '.cargo', 'bin', `goose${EXE}`),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  // PATH lookup
  try {
    const which = IS_WIN ? 'where' : 'which';
    const out = execFileSync(which, ['goose'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    if (out && existsSync(out)) return out;
  } catch {
    /* not on PATH */
  }
  return null;
}

const triple = hostTriple();
if (!triple) fail('could not determine the Rust host triple (is rustc installed?).');

const source = findGoose();
if (!source) fail('could not find the goose binary (set GOOSE_BIN, or install to ~/.local/bin).');

checkGooseVersion(source);

const target = join(binariesDir, `goose-${triple}${EXE}`);
mkdirSync(binariesDir, { recursive: true });

// Skip the copy if the target is already identical in size (cheap idempotency).
if (existsSync(target) && statSync(target).size === statSync(source).size) {
  console.log(`[stage-goose] up to date: ${target}`);
  process.exit(0);
}

copyFileSync(source, target);
console.log(`[stage-goose] staged ${source}`);
console.log(`[stage-goose]      -> ${target}`);
