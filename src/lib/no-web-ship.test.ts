// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * ADR-0010 guard — the web build is an internal dev/test harness and must
 * NEVER become a shipped or hosted surface. The release workflow builds and
 * uploads the Tauri Windows installers + latest.json only; it must not build
 * BUILD_TARGET=web, reference dist-web, or upload the web bundle. This test
 * fails the moment someone wires the harness into the ship path.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const release = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf-8');

describe('ADR-0010 — the web build never reaches the ship path', () => {
  it('release.yml does not build the web target', () => {
    expect(release).not.toMatch(/build:web/);
    expect(release).not.toMatch(/BUILD_TARGET\s*=\s*web/);
  });

  it('release.yml does not reference the web bundle output', () => {
    expect(release).not.toMatch(/dist-web/);
  });

  it('the web manifest is labeled an internal harness, not the product', () => {
    const vite = readFileSync(resolve(root, 'vite.config.ts'), 'utf-8');
    // The user-facing PWA name must not present as the shipping app.
    expect(vite).not.toMatch(/name:\s*'Alfred',/);
    expect(vite).toMatch(/internal web harness|dev\/test harness/i);
  });
});
