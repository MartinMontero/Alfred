// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Smoke-prove the SHIPPED MCP invocation: the staged Node sidecar running the
 * pre-bundled mcp-server.cjs — the exact pair the guard resolves via
 * bundled_mcp_invocation — with no npx, no tsx, and no repo node_modules in
 * the loop. Speaks one real MCP initialize handshake over stdio against a
 * throwaway vault, prints the server's answer, and exits nonzero on any miss.
 *
 * Run after `npm run build:mcp && npm run stage:node`:
 *   node scripts/smoke-mcp-bundle.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = join(root, 'src-tauri', 'binaries', 'goose-x86_64-pc-windows-msvc.exe').replace('goose-', 'node-');
const BUNDLE = join(root, 'src-tauri', 'mcp-bundle', 'mcp-server.cjs');
const VAULT = mkdtempSync(join(tmpdir(), 'alfred-mcp-smoke-vault-'));

for (const [label, p] of [['node sidecar', NODE], ['bundle', BUNDLE]]) {
  if (!existsSync(p)) {
    console.error(`SMOKE FAIL: ${label} missing at ${p} — run npm run stage:node && npm run build:mcp`);
    process.exit(1);
  }
}

const child = spawn(NODE, [BUNDLE, VAULT], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
const answer = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timed out waiting for the MCP response')), 15000);
  child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    const lines = buf.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        if (msg.id === 1) {
          clearTimeout(timer);
          resolve(msg);
        }
      } catch {
        /* partial line */
      }
    }
  });
  child.on('exit', (code) => reject(new Error(`server exited early (${code}): ${buf.slice(0, 400)}`)));
});

child.stdin.write(
  `${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'alfred-bundle-smoke', version: '0.0.0' },
    },
  })}\n`,
);

try {
  const msg = await answer;
  const server = msg.result?.serverInfo ?? {};
  const tools = msg.result?.capabilities?.tools;
  console.log(`SMOKE PASS: staged node + bundled server answered initialize`);
  console.log(`  serverInfo: ${server.name ?? '?'} ${server.version ?? ''}`);
  console.log(`  capabilities.tools present: ${Boolean(tools)}`);
  console.log(`  invocation: ${NODE}`);
  console.log(`              ${BUNDLE}`);
  console.log('  (no npx, no tsx, no node_modules in the loop)');
} finally {
  child.kill();
}
