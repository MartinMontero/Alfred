// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * The test that was missing (Phase 5 Step-2 correction).
 *
 * A YAML-shape assertion ("permission.yaml has three keys") would have PASSED
 * while goose 1.39.0 panicked on startup ("Corrupted permission config"). The only
 * sufficient proof is to make goose INGEST the real generated file: spawn
 * `goose acp` against `buildPermissionYaml()`'s actual output and confirm the ACP
 * initialize handshake succeeds with no panic. This guards against silently
 * regressing the permission-config schema.
 *
 * COVERAGE BOUNDARY (honest): the goose sidecar is gitignored (staged locally via
 * scripts/stage-goose-sidecar.mjs), a 248 MB Windows .exe. So this test runs in the
 * builder's LOCAL verify:all (the real app environment) and is SKIPPED in CI (no
 * binary / Linux runners). The definitive check is therefore local; the cheap
 * always-on regression guard is the three-list shape assertion in tool-gate.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, type Stream } from '@agentclientprotocol/sdk';
import { buildGooseConfigYaml, buildGooseEnv, type GooseProviderCreds } from './provider-lockdown';
import { buildPermissionYaml, goosePermissionPath } from './tool-gate';

const here = dirname(fileURLToPath(import.meta.url));
const GOOSE_EXE = resolve(here, '../../../src-tauri/binaries/goose-x86_64-pc-windows-msvc.exe');
// The .exe only runs on Windows, and it is gitignored (absent in CI).
const CAN_RUN = process.platform === 'win32' && existsSync(GOOSE_EXE);
const CREDS: GooseProviderCreds = { provider: 'ollama', model: 'qwen2.5', ollamaHost: 'http://localhost:11434' };

function bridge(child: ReturnType<typeof spawn>): Stream {
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout!.on('data', (b: Buffer) => controller.enqueue(new Uint8Array(b)));
      child.stdout!.on('end', () => {
        try { controller.close(); } catch { /* closed */ }
      });
    },
  });
  const writable = new WritableStream<Uint8Array>({ write(chunk) { child.stdin!.write(Buffer.from(chunk)); } });
  return ndJsonStream(writable, readable);
}

describe('goose ingests the generated permission.yaml without panicking', () => {
  if (!CAN_RUN) {
    it.skip('goose-start handshake (skipped: sidecar unavailable — runs in local verify:all only)', () => {});
    return;
  }

  it(
    'starts goose 1.39.0 against the REAL buildPermissionYaml() output (ACP initialize, no panic)',
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'alfred-perm-start-'));
      // cwd is a throwaway dir we DON'T delete, so goose's working directory never
      // locks the dir we clean up (Windows EPERM on rmSync otherwise).
      const cwd = mkdtempSync(join(tmpdir(), 'alfred-perm-cwd-'));
      let child: ReturnType<typeof spawn> | undefined;
      let stderr = '';
      try {
        mkdirSync(join(root, 'config'), { recursive: true });
        writeFileSync(
          join(root, 'config', 'config.yaml'),
          buildGooseConfigYaml({ creds: CREDS, vaultPath: root, mcpCommand: 'npx', mcpArgs: ['tsx', 'noop'] }),
          'utf8',
        );
        // The exact file the app writes (distribution.ts writes this verbatim).
        writeFileSync(goosePermissionPath(root), buildPermissionYaml(), 'utf8');

        child = spawn(GOOSE_EXE, ['acp'], {
          cwd,
          env: { ...process.env, ...buildGooseEnv(CREDS, { pathRoot: root }), GOOSE_PATH_ROOT: root },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        child.stderr!.on('data', (b: Buffer) => (stderr += b.toString()));

        const conn = new ClientSideConnection(
          () => ({ sessionUpdate() {}, async requestPermission() { return { outcome: { outcome: 'cancelled' } }; } }),
          bridge(child),
        );

        let initialized = false;
        try {
          await Promise.race([
            conn
              .initialize({
                protocolVersion: PROTOCOL_VERSION,
                clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
                clientInfo: { name: 'permission-startup-test', version: '0' },
              })
              .then(() => {
                initialized = true;
              }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('initialize timed out')), 15_000)),
          ]);
        } catch {
          // fall through — assert on stderr so a panic is shown clearly
        }

        // goose loads permission.yaml at startup; a bad file panics before the
        // handshake completes. No panic AND a completed handshake IS the proof.
        expect(stderr, `goose stderr:\n${stderr}`).not.toMatch(/panicked|Corrupted permission config/i);
        expect(initialized, `initialize did not complete; goose stderr:\n${stderr}`).toBe(true);
      } finally {
        // Best-effort teardown — never let cleanup mask the assertion result.
        if (child) {
          child.kill();
          await new Promise<void>((r) => {
            child!.once('close', () => r());
            setTimeout(r, 3000);
          });
        }
        for (const dir of [root, cwd]) {
          try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* OS reclaims temp */ }
        }
      }
    },
    30_000,
  );
});
