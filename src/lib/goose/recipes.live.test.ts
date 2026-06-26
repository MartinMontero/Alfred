// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Recipe validation integration test — runs the REAL `goose recipe validate`
 * against the recipes Alfred ships in goose-recipes/. Skipped when goose is not
 * installed. (The Tauri app calls the same subcommand via the sidecar; here we
 * invoke the binary directly.)
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function resolveGooseBin(): string | null {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    process.env.GOOSE_BIN,
    join(process.cwd(), 'src-tauri', 'binaries', `goose-x86_64-pc-windows-msvc${ext}`),
    join(homedir(), '.local', 'bin', `goose${ext}`),
    join(homedir(), '.cargo', 'bin', `goose${ext}`),
  ].filter(Boolean) as string[];
  return candidates.find((c) => existsSync(c)) ?? null;
}

const GOOSE = resolveGooseBin();
const RECIPES = join(process.cwd(), 'goose-recipes');

describe.skipIf(!GOOSE)('goose recipe validation (live)', () => {
  it.each(['vault-summary.yaml', 'vault-research.yaml'])('validates %s', (file) => {
    const out = execFileSync(GOOSE as string, ['recipe', 'validate', join(RECIPES, file)], {
      encoding: 'utf8',
    });
    expect(out).toMatch(/valid/i);
  });
});
