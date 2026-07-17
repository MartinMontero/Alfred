// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { mapUpdaterError, downloadAndInstallPending } from './updater';

describe('W5 updater — plain-language error mapping', () => {
  it('unconfigured build (pubkey pending the keypair ceremony) says so honestly', () => {
    expect(mapUpdaterError(new Error('the `plugins > updater` configuration is invalid: pubkey missing')))
      .toMatch(/not configured in this build/);
  });
  it('signature failure is a rejection, never an install', () => {
    expect(mapUpdaterError(new Error('signature verification failed'))).toMatch(/rejected/);
    expect(mapUpdaterError(new Error('could not verify update archive'))).toMatch(/rejected/);
  });
  it('network shapes map to a reachability message', () => {
    for (const m of ['error sending request for url', 'Could not fetch latest.json', 'HTTP 404']) {
      expect(mapUpdaterError(new Error(m))).toMatch(/update service/);
    }
  });
  it('unknown errors pass the raw reason through, never silently', () => {
    expect(mapUpdaterError(new Error('weird disk state'))).toContain('weird disk state');
  });
});

describe('W5 updater — consent boundaries', () => {
  it('refuses to install without a prior check (no staged update)', async () => {
    await expect(downloadAndInstallPending()).rejects.toThrow(/run a check first/);
  });
});
