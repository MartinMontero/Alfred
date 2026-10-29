// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Dual-era MCP negotiation + write-if-unchanged (expectedVersion) tests.
 *
 * Spec basis (verified 2026-10-29 against modelcontextprotocol/modelcontextprotocol
 * @ tag 2026-07-28):
 *  - server/discover: DiscoverResult { resultType, supportedVersions, capabilities,
 *    _meta.serverInfo, ttlMs, cacheScope }.
 *  - UnsupportedProtocolVersionError: JSON-RPC code -32022, data { requested, supported }.
 *  - stdio backward-compat: any OTHER error (or silence) marks a legacy server; a
 *    DiscoverResult or a recognized modern error marks a dual-era/modern server.
 *  - SDK ceiling: @modelcontextprotocol/sdk 1.32.2 SUPPORTED_PROTOCOL_VERSIONS tops
 *    out at 2025-11-25 — dual-era is the only SDK-buildable conformant target.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAlfredMcpServer } from './server';
import { wrapDualEra, SUPPORTED_VERSIONS, MODERN_META_KEY } from './dual-era';

let root: string;

function textOf(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content.map((c) => c.text ?? '').join('');
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'alfred-dual-era-'));
  await fs.writeFile(path.join(root, 'note.md'), '# v1 content\n', 'utf8');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** Wire a dual-era-wrapped server to a raw JSON-RPC sender over InMemoryTransport. */
async function wireRaw() {
  const { server } = createAlfredMcpServer(root);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(wrapDualEra(serverSide));
  let nextId = 1;
  const pending = new Map<number, (msg: unknown) => void>();
  const received: unknown[] = [];
  clientSide.onmessage = (msg) => {
    received.push(msg);
    const id = (msg as { id?: number }).id;
    if (id !== undefined && pending.has(id)) {
      pending.get(id)!(msg);
      pending.delete(id);
    }
  };
  await clientSide.start();
  return {
    clientSide,
    received,
    sendRaw(msg: Record<string, unknown>): Promise<unknown> {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        void clientSide.send({ jsonrpc: '2.0', id, ...msg } as never);
      });
    },
  };
}

describe('dual-era negotiation', () => {
  it('answers server/discover with a DiscoverResult naming the served legacy version', async () => {
    const io = await wireRaw();
    const res = (await io.sendRaw({
      method: 'server/discover',
      params: {
        _meta: {
          [MODERN_META_KEY]: '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'probe', version: '0.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    })) as { result?: { supportedVersions?: string[]; resultType?: string; capabilities?: object }; error?: unknown };
    expect(res.error).toBeUndefined();
    expect(res.result?.resultType).toBe('complete');
    expect(res.result?.supportedVersions).toEqual([...SUPPORTED_VERSIONS]);
    expect(res.result?.capabilities).toHaveProperty('tools');
    await io.clientSide.close();
  });

  it('returns UnsupportedProtocolVersionError (-32022) for a modern request at an unserved version', async () => {
    const io = await wireRaw();
    const res = (await io.sendRaw({
      method: 'tools/list',
      params: { _meta: { [MODERN_META_KEY]: '2026-07-28' } },
    })) as { error?: { code?: number; data?: { requested?: string; supported?: string[] } } };
    expect(res.error?.code).toBe(-32022);
    expect(res.error?.data?.requested).toBe('2026-07-28');
    expect(res.error?.data?.supported).toEqual([...SUPPORTED_VERSIONS]);
    await io.clientSide.close();
  });

  it('still serves the legacy initialize handshake (2025-11-25) through the wrapper', async () => {
    const io = await wireRaw();
    const init = (await io.sendRaw({
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'legacy-probe', version: '0.0.0' },
      },
    })) as { result?: { protocolVersion?: string; serverInfo?: { name?: string } }; error?: unknown };
    expect(init.error).toBeUndefined();
    expect(init.result?.protocolVersion).toBe('2025-11-25');
    expect(init.result?.serverInfo?.name).toBe('alfred-vault');
    await io.clientSide.close();
  });
});

describe('expectedVersion / write-if-unchanged', () => {
  let client: Client;

  beforeAll(async () => {
    const { server } = createAlfredMcpServer(root);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(wrapDualEra(st));
    client = new Client({ name: 'vitest', version: '0.0.0' });
    await client.connect(ct);
  });

  it('a read result carries expectedVersion', async () => {
    const res = await client.callTool({ name: 'vault_read', arguments: { path: 'note.md' } });
    const body = JSON.parse(textOf(res as { content: Array<{ type: string; text?: string }> }));
    expect(typeof body.expectedVersion).toBe('string');
    expect(body.expectedVersion.length).toBeGreaterThan(0);
  });

  it('a write with the current version succeeds and returns the new version', async () => {
    const read = await client.callTool({ name: 'vault_read', arguments: { path: 'note.md' } });
    const body = JSON.parse(textOf(read as { content: Array<{ type: string; text?: string }> }));
    const write = await client.callTool({
      name: 'vault_write',
      arguments: { path: 'note.md', content: '# v2 content\n', expectedVersion: body.expectedVersion },
    });
    const wbody = JSON.parse(textOf(write as { content: Array<{ type: string; text?: string }> }));
    expect(wbody.ok).toBe(true);
    expect(typeof wbody.version).toBe('string');
    expect(wbody.version).not.toBe(body.expectedVersion);
  });

  it('a stale write is CONFLICT and the vault content is unchanged (human-edit-wins)', async () => {
    const read = await client.callTool({ name: 'vault_read', arguments: { path: 'note.md' } });
    const v1 = JSON.parse(textOf(read as { content: Array<{ type: string; text?: string }> })).expectedVersion;
    // human edits out of band
    await fs.writeFile(path.join(root, 'note.md'), '# v3 human edit\n', 'utf8');
    const write = await client.callTool({
      name: 'vault_write',
      arguments: { path: 'note.md', content: '# v3 agent clobber\n', expectedVersion: v1 },
    });
    const res = write as { isError?: boolean; content: Array<{ type: string; text?: string }> };
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('CONFLICT');
    const onDisk = await fs.readFile(path.join(root, 'note.md'), 'utf8');
    expect(onDisk).toBe('# v3 human edit\n');
  });

  it('creating a new note requires expectedVersion null; null against an existing note is CONFLICT', async () => {
    const create = await client.callTool({
      name: 'vault_write',
      arguments: { path: 'fresh.md', content: '# new\n', expectedVersion: null },
    });
    expect(JSON.parse(textOf(create as { content: Array<{ type: string; text?: string }> })).ok).toBe(true);
    const clobber = (await client.callTool({
      name: 'vault_write',
      arguments: { path: 'fresh.md', content: '# overwrite\n', expectedVersion: null },
    })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
    expect(clobber.isError).toBe(true);
    expect(textOf(clobber)).toContain('CONFLICT');
  });

  it('structure-preserving writes (vault_append) honor expectedVersion too', async () => {
    const read = await client.callTool({ name: 'vault_read', arguments: { path: 'note.md' } });
    const v = JSON.parse(textOf(read as { content: Array<{ type: string; text?: string }> })).expectedVersion;
    const okAppend = await client.callTool({
      name: 'vault_append',
      arguments: { path: 'note.md', heading: 'Log', content: 'line', expectedVersion: v },
    });
    expect((okAppend as { isError?: boolean }).isError ?? false).toBe(false);
    const stale = (await client.callTool({
      name: 'vault_append',
      arguments: { path: 'note.md', heading: 'Log', content: 'line2', expectedVersion: v },
    })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
    expect(stale.isError).toBe(true);
    expect(textOf(stale)).toContain('CONFLICT');
  });
});
