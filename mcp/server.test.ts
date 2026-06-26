// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAlfredMcpServer } from './server';
import { buildScaffoldPlan } from '../src/lib/agentic/topology';

let root: string;
let client: Client;

function textOf(res: { content: Array<{ type: string; text?: string }>; isError?: boolean }): string {
  return res.content.map((c) => c.text ?? '').join('');
}

/** Call a tool; report whether it was rejected (validation throw OR isError). */
async function callRejected(name: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean };
    return r.isError === true;
  } catch {
    return true;
  }
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'alfred-mcp-'));
  // Materialize a real Phase-2 agentic vault on disk, then serve it.
  for (const e of buildScaffoldPlan({ project: 'MCP Test', now: Date.parse('2026-06-25T00:00:00Z') })) {
    const abs = path.join(root, e.path);
    if (e.kind === 'folder') {
      await fs.mkdir(abs, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, e.content ?? '', 'utf8');
    }
  }

  const { server } = createAlfredMcpServer(root);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-harness', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client?.close();
  await fs.rm(root, { recursive: true, force: true });
});

describe('Alfred MCP server — a harness connects over stdio (in-memory) and reads ground truth', () => {
  it('advertises the expected tools', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const expected of [
      'vault_search', 'vault_read', 'vault_append', 'vault_patch', 'vault_write',
      'frontmatter_get', 'frontmatter_set', 'memory_bank_read', 'memory_bank_update',
      'hot_read', 'spec_read',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('every tool schema sets additionalProperties:false (rejects unknown keys)', async () => {
    for (const t of (await client.listTools()).tools) {
      const schema = t.inputSchema as { type?: string; additionalProperties?: boolean };
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties, `${t.name} schema`).toBe(false);
    }
  });

  it('reads hot.md, a note, and a Memory Bank file', async () => {
    expect(textOf(await client.callTool({ name: 'hot_read', arguments: {} }) as any)).toContain('hot.md — MCP Test');
    expect(textOf(await client.callTool({ name: 'vault_read', arguments: { path: 'brain/RULES.md' } }) as any)).toContain('# Rules');
    expect(textOf(await client.callTool({ name: 'memory_bank_read', arguments: { file: 'progress.md' } }) as any)).toContain('# Progress');
  });

  it('vault_read resolves [[wikilinks]] to existing notes', async () => {
    const out = textOf(await client.callTool({ name: 'vault_read', arguments: { path: 'hot.md' } }) as any);
    expect(out).toContain('"resolved"');
    expect(out).toMatch(/brain\/NORTH_STAR\.md/);
  });

  it('runs a guarded, structure-preserving append', async () => {
    await client.callTool({ name: 'vault_append', arguments: { path: 'inbox/log.md', heading: 'Log', content: '- first entry' } });
    const back = textOf(await client.callTool({ name: 'vault_read', arguments: { path: 'inbox/log.md' } }) as any);
    expect(back).toContain('## Log');
    expect(back).toContain('- first entry');
  });
});

describe('Alfred MCP server — security', () => {
  it('blocks path traversal: Unix, Windows backslash, absolute, UNC', async () => {
    expect(await callRejected('vault_read', { path: '../../etc/passwd' })).toBe(true);
    expect(await callRejected('vault_read', { path: '..\\..\\Windows\\System32\\config' })).toBe(true);
    expect(await callRejected('vault_read', { path: 'C:\\Windows\\System32\\drivers\\etc\\hosts' })).toBe(true);
    expect(await callRejected('vault_read', { path: '\\\\server\\share\\secret' })).toBe(true);
    expect(await callRejected('vault_write', { path: '../escape.md', content: 'x' })).toBe(true);
  });

  it('rejects unknown/additional properties (strict schema)', async () => {
    expect(await callRejected('vault_read', { path: 'hot.md', injected: 'extra' })).toBe(true);
    expect(await callRejected('hot_read', { unexpected: true })).toBe(true);
  });

  it('stamps durable Memory Bank writes with provenance (anti-poisoning)', async () => {
    await client.callTool({ name: 'memory_bank_update', arguments: { file: 'progress.md', heading: 'Progress', content: 'MCP server shipped.' } });
    const back = textOf(await client.callTool({ name: 'memory_bank_read', arguments: { file: 'progress.md' } }) as any);
    expect(back).toContain('MCP server shipped.');
    expect(back).toContain('provenance: mcp');
  });

  it('memory_bank_update cannot escape memory-bank/ via traversal', async () => {
    expect(await callRejected('memory_bank_update', { file: '../../etc/evil.md', heading: 'x', content: 'y' })).toBe(true);
  });
});
