// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * ACP handshake integration test — drives the REAL `goose acp` over stdio with
 * the same ACP SDK 1.0 surface Alfred uses (ClientSideConnection + ndJsonStream,
 * PROTOCOL_VERSION 1, session/new), proving Alfred ↔ goose ACP end to end.
 *
 * The Tauri runtime bridges the sidecar's stdio into Web streams; here (Node) we
 * bridge child_process stdio the same way. Skipped when goose is not installed,
 * so CI without goose stays green; runs live on the build machine.
 */
import { describe, it, expect } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { existsSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { filterGooseProviderOptions, type GooseProviderOption } from './provider-lockdown';

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

describe.skipIf(!GOOSE)('goose ACP handshake (live)', () => {
  it(
    'initializes and creates a session over stdio, and the advertised provider list is denylist-filtered',
    async () => {
      const pathRoot = mkdtempSync(join(tmpdir(), 'alfred-goose-'));
      const child: ChildProcessWithoutNullStreams = spawn(GOOSE as string, ['acp'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GOOSE_DISABLE_KEYRING: '1',
          GOOSE_PATH_ROOT: pathRoot, // isolate from the user's real goose config
          GOOSE_PROVIDER: 'anthropic',
          GOOSE_MODEL: 'claude-3-5-sonnet-latest',
        },
      });

      const client = {
        requestPermission: async () => ({ outcome: { outcome: 'cancelled' as const } }),
        sessionUpdate: async () => {},
      };

      const stream = ndJsonStream(
        Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
        Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      );
      const conn = new ClientSideConnection(() => client, stream);

      try {
        const init = await conn.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
          clientInfo: { name: 'alfred-test', version: '0.1.0' },
        });
        expect(init.protocolVersion).toBe(1);
        expect(init.agentInfo?.name).toBe('goose');

        const session = await conn.newSession({ cwd: pathRoot, mcpServers: [] });
        expect(typeof session.sessionId).toBe('string');
        expect(session.sessionId.length).toBeGreaterThan(0);

        // goose defaults to 'auto' (the bypass). Step 2 takes it off auto at runtime;
        // prove setSessionMode('approve') applies against real goose (no error).
        expect(session.modes?.currentModeId).toBe('auto');
        await expect(
          conn.setSessionMode({ sessionId: session.sessionId, modeId: 'approve' }),
        ).resolves.toBeDefined();

        // The provider list goose advertises over ACP contains the excluded vendors
        // (they are compiled into the binary). Alfred's denylist must filter them out.
        const providerOpt = session.configOptions?.find((o) => o.id === 'provider');
        const advertised: GooseProviderOption[] =
          providerOpt && 'options' in providerOpt && Array.isArray(providerOpt.options)
            ? (providerOpt.options as GooseProviderOption[])
            : [];
        const advertisedValues = advertised.map((o) => o.value);
        expect(advertisedValues).toContain('openai'); // present in the binary
        expect(advertisedValues).toContain('xai');

        const permitted = filterGooseProviderOptions(advertised).map((o) => o.value);
        expect(permitted).toContain('anthropic');
        expect(permitted).not.toContain('openai');
        expect(permitted).not.toContain('xai');
        expect(permitted).not.toContain('codex');
      } finally {
        child.kill();
        // Best-effort cleanup: goose may still hold file handles in pathRoot right
        // after kill on Windows; the OS reclaims the temp dir regardless.
        try {
          rmSync(pathRoot, { recursive: true, force: true });
        } catch {
          /* ignore EPERM from lingering handles */
        }
      }
    },
    45_000,
  );
});
