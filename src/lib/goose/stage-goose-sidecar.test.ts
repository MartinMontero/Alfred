// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * W0 canary: re-staging the goose sidecar must never silently downgrade goose.
 *
 * scripts/stage-goose-sidecar.mjs pins EXPECTED_GOOSE_VERSION. Before the W0 fix,
 * a goose binary reporting any other version (for example the 1.48.0 install on
 * this machine's PATH / ~/.local/bin) only produced a WARNING and was then
 * copied over the sidecar anyway. The script must instead REFUSE it, name both
 * versions, and stage nothing.
 *
 * Hermetic by construction:
 *  - The script under test is COPIED into a temporary sandbox, so its computed
 *    repo root is the sandbox and anything it would stage lands in
 *    <sandbox>/src-tauri/binaries, never in this checkout.
 *  - GOOSE_BIN always points at a FAKE goose fixture that exists (asserted before
 *    every run), so the script's lookup never falls through to a real goose.
 *    The real goose is never executed and nothing is downloaded.
 *  - The fake is a POSIX shell script on Linux/macOS; on Windows (where a
 *    script cannot be exec'd directly) it is a tiny executable compiled from
 *    one println! line with the local rustc, which Alfred already requires.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const IS_WIN = process.platform === 'win32';
const repoRoot = join(__dirname, '..', '..', '..');
const PIN = '1.56.0';

let sandbox = '';
const fakes: Record<string, string> = {};

/** Write a fake `goose` that prints `output` for any arguments (incl. --version). */
function makeFakeGoose(dir: string, name: string, output: string): string {
  mkdirSync(dir, { recursive: true });
  if (!IS_WIN) {
    const bin = join(dir, name);
    // Single-quoted printf argument: the fixture outputs contain no quotes.
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' '${output}'\n`);
    chmodSync(bin, 0o755);
    return bin;
  }
  const src = join(dir, `${name}.rs`);
  const bin = join(dir, `${name}.exe`);
  writeFileSync(src, `fn main() { println!("{}", ${JSON.stringify(output)}); }\n`);
  execFileSync('rustc', ['--edition', '2021', '--crate-name', 'fake_goose', '-C', 'debuginfo=0', '-o', bin, src], {
    stdio: 'pipe',
  });
  return bin;
}

/** Run the sandboxed copy of the stage script with GOOSE_BIN pinned to a fake. */
function stageWith(fake: string, extraArgs: string[] = []) {
  // Safety interlock: if the fixture were missing, the script would fall back to
  // searching ~/.local/bin and PATH and could execute a REAL goose.
  expect(existsSync(fake)).toBe(true);
  const res = spawnSync(process.execPath, [join(sandbox, 'scripts', 'stage-goose-sidecar.mjs'), ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env, GOOSE_BIN: fake },
    timeout: 60_000,
  });
  return { code: res.status, out: `${res.stdout}\n${res.stderr}` };
}

function stagedGooseFiles(): string[] {
  const dir = join(sandbox, 'src-tauri', 'binaries');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('goose-')) : [];
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'alfred-stage-goose-'));
  mkdirSync(join(sandbox, 'scripts'));
  copyFileSync(join(repoRoot, 'scripts', 'stage-goose-sidecar.mjs'), join(sandbox, 'scripts', 'stage-goose-sidecar.mjs'));
  const fixtures = join(sandbox, 'fixtures');
  fakes.old = makeFakeGoose(fixtures, 'goose-old', 'goose 1.48.0');
  fakes.prerelease = makeFakeGoose(fixtures, 'goose-prerelease', 'goose 1.56.0-rc.1');
  fakes.noVersion = makeFakeGoose(fixtures, 'goose-noversion', 'goose (version unavailable)');
  fakes.pinned = makeFakeGoose(fixtures, 'goose-pinned', `goose ${PIN}`);
}, 120_000);

afterAll(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

describe('stage-goose-sidecar refuses any goose that is not the pin (W0 downgrade canary)', () => {
  it('the test pins the same version as the script (keeps this canary honest after a bump)', () => {
    const script = readFileSync(join(repoRoot, 'scripts', 'stage-goose-sidecar.mjs'), 'utf8');
    expect(script).toContain(`EXPECTED_GOOSE_VERSION = '${PIN}'`);
  });

  it.each([
    ['default mode (the predev/prebuild hook)', [] as string[]],
    ['--require mode', ['--require']],
  ])('CANARY: refuses a fake goose reporting 1.48.0 in %s, names both versions, stages nothing', (_label, args) => {
    const { code, out } = stageWith(fakes.old, args);
    expect(code).toBe(1);
    expect(out).toContain('1.48.0');
    expect(out).toContain(PIN);
    expect(stagedGooseFiles()).toEqual([]);
  });

  it('refuses a pre-release of the pinned version (1.56.0-rc.1 is not 1.56.0)', () => {
    const { code, out } = stageWith(fakes.prerelease);
    expect(code).toBe(1);
    expect(out).toContain('1.56.0-rc.1');
    expect(stagedGooseFiles()).toEqual([]);
  });

  it('refuses a goose whose --version output carries no version at all', () => {
    const { code, out } = stageWith(fakes.noVersion);
    expect(code).toBe(1);
    expect(out).toContain(PIN);
    expect(stagedGooseFiles()).toEqual([]);
  });

  // Control (passes before and after the fix): the check is not a blanket refusal.
  it('accepts a fake goose reporting exactly the pin', () => {
    const { code, out } = stageWith(fakes.pinned);
    // Exit 0 either way: staged into the sandbox, or skipped later if rustc is
    // unavailable to compute the host triple. Both are past the version check.
    expect(code).toBe(0);
    expect(out).toContain(`goose ${PIN} matches the target`);
  });
});
