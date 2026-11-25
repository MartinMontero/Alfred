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
 *
 * Version pin (always fatal): a goose binary whose `--version` does not report
 * exactly EXPECTED_GOOSE_VERSION is REFUSED with exit 1, even without
 * `--require`. A wrong version is not "goose missing" — staging it would
 * silently swap the harness Alfred was verified against (W0, BuilderOS
 * integration audit 2026-11-16: a re-stage picked up the 1.48.0 goose on this
 * machine instead of the pinned 1.56.0).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

const REQUIRE = process.argv.includes('--require');
const IS_WIN = platform() === 'win32';
const EXE = IS_WIN ? '.exe' : '';

// The goose version Alfred targets. A SHA-256 pin is Stage-E (E4) work; the
// version check below is a HARD check — any other reported version (older,
// newer, or a pre-release of the pin) is refused and nothing is staged. Bump
// this constant when the harness version decision changes, and re-run the
// live-goose trio on Windows.
const EXPECTED_GOOSE_VERSION = '1.56.0';

/**
 * The version token in `goose --version` output: the first X.Y.Z, including
 * any pre-release/build suffix, so `1.56.0-rc.1` is NOT mistaken for `1.56.0`.
 */
function parseGooseVersion(output) {
  const m = output.match(/(?<![\d.])(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
  return m ? m[1] : null;
}

/** Refuse (exit 1) any goose whose reported version is not exactly the pin. */
function requirePinnedGooseVersion(bin) {
  let out;
  try {
    out = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  } catch (e) {
    refuse(
      `could not run "${bin} --version" (${e instanceof Error ? e.message : String(e)}), ` +
        `so its version cannot be confirmed as the pinned ${EXPECTED_GOOSE_VERSION}.`,
    );
  }
  const found = parseGooseVersion(out);
  if (found === null) {
    const shown = out.length > 80 ? `${out.slice(0, 80)}...` : out;
    refuse(`"${bin} --version" reported no version ("${shown}"); Alfred pins goose ${EXPECTED_GOOSE_VERSION}.`);
  }
  if (found !== EXPECTED_GOOSE_VERSION) {
    refuse(`${bin} is goose ${found}, but Alfred pins goose ${EXPECTED_GOOSE_VERSION}.`);
  }
  console.log(`[stage-goose] goose ${found} matches the target.`);
}

function refuse(msg) {
  console.error(`[stage-goose] REFUSED: ${msg}`);
  console.error('[stage-goose] Nothing was staged: a mismatched sidecar would silently change the goose Alfred runs.');
  console.error(
    `[stage-goose] Install goose ${EXPECTED_GOOSE_VERSION}, point GOOSE_BIN at it, then re-run. ` +
      'After any version change, re-run the live-goose tests (recipes.live).',
  );
  process.exit(1);
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

const source = findGoose();
if (!source) fail('could not find the goose binary (set GOOSE_BIN, or install to ~/.local/bin).');

// Before anything is computed or copied: a wrong version is refused outright.
requirePinnedGooseVersion(source);

const triple = hostTriple();
if (!triple) fail('could not determine the Rust host triple (is rustc installed?).');

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
