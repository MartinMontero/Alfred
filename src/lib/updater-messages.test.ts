// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  mapUpdaterError,
  downloadAndInstallPending,
  isExpectedBetaState,
  __stagePendingForTest,
  type ApplyHooks,
} from './updater';

describe('W5 updater — plain-language error mapping', () => {
  it('unconfigured build (pubkey pending the keypair ceremony) says so honestly', () => {
    expect(mapUpdaterError(new Error('the `plugins > updater` configuration is invalid: pubkey missing')))
      .toMatch(/not configured in this build/);
  });
  it('signature failure is a rejection, never an install', () => {
    expect(mapUpdaterError(new Error('signature verification failed'))).toMatch(/rejected/);
    expect(mapUpdaterError(new Error('could not verify update archive'))).toMatch(/rejected/);
  });
  it('network shapes map to the expected-during-beta message (F4)', () => {
    for (const m of ['error sending request for url', 'Could not fetch latest.json', 'HTTP 404']) {
      expect(mapUpdaterError(new Error(m))).toMatch(/expected/);
      expect(isExpectedBetaState(new Error(m))).toBe(true);
    }
  });
  it('signature failures are NEVER an expected state', () => {
    expect(isExpectedBetaState(new Error('signature verification failed'))).toBe(false);
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

describe('W5 updater — beta.6 apply instrumentation', () => {
  it('runs preApply BEFORE the installer handoff and traces every step', async () => {
    // Failure-proof: if preApply moves after the handoff, or a trace call is
    // dropped, this exact-order assertion fails.
    const order: string[] = [];
    __stagePendingForTest({
      version: '9.9.9',
      body: null,
      downloadAndInstall: async () => {
        order.push('install');
      },
    });
    const hooks: ApplyHooks = {
      preApply: async () => {
        order.push('preApply');
      },
      trace: async (event) => {
        order.push(`trace:${event}`);
      },
    };
    try {
      await downloadAndInstallPending(undefined, hooks);
      expect(order).toEqual([
        'trace:apply:start',
        'preApply',
        'trace:apply:handoff',
        'install',
        'trace:apply:returned',
      ]);
    } finally {
      __stagePendingForTest(null);
    }
  });

  it('traces apply errors and rethrows them — never swallowed by tracing', async () => {
    const events: string[] = [];
    __stagePendingForTest({
      version: '9.9.9',
      body: null,
      downloadAndInstall: async () => {
        throw new Error('installer died');
      },
    });
    const hooks: ApplyHooks = {
      preApply: async () => {},
      trace: async (event, detail) => {
        events.push(`${event}|${detail}`);
      },
    };
    try {
      await expect(downloadAndInstallPending(undefined, hooks)).rejects.toThrow('installer died');
      expect(events.some((e) => e.startsWith('apply:error|'))).toBe(true);
    } finally {
      __stagePendingForTest(null);
    }
  });
});
