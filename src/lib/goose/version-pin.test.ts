// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Pin-consistency test: the goose version is pinned in several load-bearing
 * places (stage script, release workflow, gate.ps1 checks, RECIPE.md proof
 * lines). A bump that lands in only some of them is exactly the drift the
 * DRIFT RULE exists to catch. This test derives the canonical version from
 * scripts/stage-goose-sidecar.mjs and asserts every other site agrees.
 *
 * Red-first proven: with only scripts/stage-goose-sidecar.mjs bumped and the
 * other sites still on the old version, this test FAILS (see PR body).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function stageScriptVersion(): string {
  const m = read('scripts/stage-goose-sidecar.mjs').match(/EXPECTED_GOOSE_VERSION = '([^']+)'/);
  if (!m) throw new Error('stage-goose-sidecar.mjs does not pin EXPECTED_GOOSE_VERSION');
  return m[1];
}

function releaseWorkflowVersion(): string | null {
  const m = read('.github/workflows/release.yml').match(/GOOSE_VERSION:\s*'([^']+)'/);
  return m ? m[1] : null;
}

// gate.ps1 embeds the pin inside PowerShell regexes as escaped dots: 1\.48\.0
// (the Holmes tag v1\.0\.0-rc\.1 lives in the same file, so scope by line:
// goose-pin lines name GOOSE_VERSION, and the staged-binary soft check is the
// `$ver -notmatch 'X\.Y\.Z'` line inside the goose/ACP subsystem check).
function gateVersions(): string[] {
  const gate = read('gate.ps1');
  const out: string[] = [];
  for (const line of gate.split(/\r?\n/)) {
    if (!/GOOSE_VERSION/.test(line) && !/\$ver -notmatch '\d/.test(line)) continue;
    for (const m of line.matchAll(/(\d+)\\\.(\d+)\\\.(\d+)/g)) out.push(`${m[1]}.${m[2]}.${m[3]}`);
  }
  return out;
}

function recipeVersions(): string[] {
  const recipe = read('RECIPE.md');
  const out: string[] = [];
  for (const m of recipe.matchAll(/EXPECTED_GOOSE_VERSION = '([^']+)'/g)) out.push(m[1]);
  for (const m of recipe.matchAll(/GOOSE_VERSION: '([^']+)'/g)) out.push(m[1]);
  return out;
}

describe('goose version pin consistency', () => {
  it('release.yml GOOSE_VERSION matches the stage-script pin', () => {
    expect(releaseWorkflowVersion()).toBe(stageScriptVersion());
  });

  it('every goose pin regex in gate.ps1 matches the stage-script pin', () => {
    const canonical = stageScriptVersion();
    const versions = gateVersions();
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) expect(v).toBe(canonical);
  });

  it('every goose pin quoted in RECIPE.md proof lines matches the stage-script pin', () => {
    const canonical = stageScriptVersion();
    const versions = recipeVersions();
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) expect(v).toBe(canonical);
  });
});
