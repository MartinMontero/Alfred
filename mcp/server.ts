// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Alfred MCP server (Phase 3) — exposes the Phase-2 agentic vault as ground truth
 * to any MCP harness (goose, Claude Code) over stdio.
 *
 * Desktop / filesystem capability. It REUSES the Phase-2 pure modules
 * (frontmatter, agentic/*) as the source of truth and never reimplements the
 * vault. Spec 2025-11-25 + @modelcontextprotocol/sdk v1.29.0, Zod schemas.
 *
 * Security posture (mandatory): every tool input is untrusted (it comes from an
 * LLM); every path is confined to the vault root by VaultFs.resolve; every tool
 * uses a strict Zod object (additionalProperties:false — unknown keys rejected);
 * durable-memory writes carry a provenance stamp (anti-poisoning).
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { VaultFs, VaultPathError } from './vault-fs';
import { searchVault, type SearchNote } from './search';
import { appendUnderHeading, replaceUnderHeading } from './markdown';
import { isNaddr, decodeNaddr, resolveIdentifierToPath } from './naddr';
import { parseFrontmatter, setProperty } from '../src/lib/frontmatter';
import { extractWikilinks } from '../src/lib/agentic/frontmatter-schema';

export const SERVER_NAME = 'alfred-vault';
export const SERVER_VERSION = '0.1.0';
export const PROTOCOL_VERSION = '2025-11-25';

// W3C Trace Context key names — adopted now for forward-compat with the
// 2026-07-28 spec / SEP-414 (full correlation wiring lands in Phase 5).
export const TRACE_CONTEXT_KEYS = ['traceparent', 'tracestate', 'baggage'] as const;

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

/** Map any error to a clean tool error result (traversal refusals surface plainly). */
function toToolError(e: unknown): ToolResult {
  if (e instanceof VaultPathError) return fail(`Refused: ${e.message}`);
  return fail(`Error: ${e instanceof Error ? e.message : String(e)}`);
}

async function readAllNotes(vault: VaultFs): Promise<SearchNote[]> {
  const paths = await vault.list('.md');
  const notes: SearchNote[] = [];
  for (const path of paths) {
    try {
      notes.push({ path, content: await vault.read(path) });
    } catch {
      /* unreadable — skip */
    }
  }
  return notes;
}

async function noteIndex(vault: VaultFs): Promise<Array<{ path: string; id?: string }>> {
  const notes = await readAllNotes(vault);
  return notes.map((n) => {
    const fm = parseFrontmatter(n.content);
    const id = fm?.properties.find((p) => p.key === 'id')?.value;
    return { path: n.path, id: typeof id === 'string' ? id : undefined };
  });
}

/** Resolve a path OR an naddr to a vault-relative note path. */
async function resolveAddress(vault: VaultFs, address: string): Promise<string> {
  if (isNaddr(address)) {
    const { identifier } = decodeNaddr(address);
    const path = resolveIdentifierToPath(identifier, await noteIndex(vault));
    if (!path) throw new VaultPathError(`naddr identifier "${identifier}" resolves to no note.`);
    return path;
  }
  return address;
}

/**
 * Build a fully-wired Alfred MCP server over a vault root. Exposed as a factory
 * so tests can connect an in-memory client and exercise it.
 */
export function createAlfredMcpServer(vaultRoot: string): { server: McpServer; vault: VaultFs } {
  const vault = new VaultFs(vaultRoot);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  // ---------- Resources (read-only) ----------

  server.registerResource('hot', 'alfred://hot', { title: 'hot.md', description: 'Current-state vault anchor', mimeType: 'text/markdown' }, async (uri) => {
    return { contents: [{ uri: uri.href, text: await vault.read('hot.md') }] };
  });

  server.registerResource(
    'note',
    new ResourceTemplate('alfred://note/{+path}', { list: undefined }),
    { title: 'Vault note', description: 'A note addressed by vault-relative path', mimeType: 'text/markdown' },
    async (uri, vars) => {
      const path = await resolveAddress(vault, decodeURIComponent(String(vars.path)));
      return { contents: [{ uri: uri.href, text: await vault.read(path) }] };
    },
  );

  server.registerResource(
    'naddr',
    new ResourceTemplate('alfred://naddr/{naddr}', { list: undefined }),
    { title: 'Vault note by NIP-19 naddr', description: 'A note addressed by naddr', mimeType: 'text/markdown' },
    async (uri, vars) => {
      const path = await resolveAddress(vault, String(vars.naddr));
      return { contents: [{ uri: uri.href, text: await vault.read(path) }] };
    },
  );

  // ---------- Tools (writes confirmed; strict schemas; path-confined) ----------

  server.registerTool('vault_search', {
    title: 'Search the vault',
    description: 'Search notes by text, frontmatter description, tag, and domain. Backlink-aware.',
    inputSchema: z.strictObject({
      query: z.string().describe('Free-text query (matched against path, description, tags, domain, body).'),
      tag: z.string().optional(),
      domain: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
  }, async (args) => {
    try {
      const hits = searchVault(await readAllNotes(vault), args.query, { tag: args.tag, domain: args.domain, limit: args.limit ?? 20 });
      return ok(JSON.stringify(hits, null, 2));
    } catch (e) { return toToolError(e); }
  });

  server.registerTool('vault_read', {
    title: 'Read a note',
    description: 'Read a note by path or naddr; returns content plus resolved [[wikilinks]].',
    inputSchema: z.strictObject({ path: z.string().describe('Vault-relative path or naddr.') }),
  }, async (args) => {
    try {
      const path = await resolveAddress(vault, args.path);
      const content = await vault.read(path);
      const index = await noteIndex(vault);
      const links = extractWikilinks(content).map((target) => ({
        target,
        resolved: resolveIdentifierToPath(target, index) ?? (index.find((n) => n.path === `${target}.md` || n.path === target)?.path ?? null),
      }));
      return ok(JSON.stringify({ path, content, wikilinks: links }, null, 2));
    } catch (e) { return toToolError(e); }
  });

  server.registerTool('vault_append', {
    title: 'Append under a heading',
    description: 'Append content under a heading (structure-preserving, never clobbers). Creates the section if absent.',
    inputSchema: z.strictObject({
      path: z.string(),
      heading: z.string(),
      content: z.string(),
    }),
  }, async (args) => {
    try {
      const existing = (await vault.exists(args.path)) ? await vault.read(args.path) : '';
      await vault.write(args.path, appendUnderHeading(existing, args.heading, args.content));
      return ok(`Appended under "${args.heading}" in ${args.path}.`);
    } catch (e) { return toToolError(e); }
  });

  server.registerTool('vault_patch', {
    title: 'Patch a heading section',
    description: 'Replace the body under an existing heading, keeping the rest of the note intact.',
    inputSchema: z.strictObject({ path: z.string(), heading: z.string(), content: z.string() }),
  }, async (args) => {
    try {
      const existing = await vault.read(args.path);
      await vault.write(args.path, replaceUnderHeading(existing, args.heading, args.content));
      return ok(`Patched "${args.heading}" in ${args.path}.`);
    } catch (e) { return toToolError(e); }
  });

  server.registerTool('vault_write', {
    title: 'Write a note (guarded)',
    description: 'Write a full note. Path-confined to the vault root; the LLM must supply the complete content.',
    inputSchema: z.strictObject({ path: z.string(), content: z.string() }),
  }, async (args) => {
    try {
      await vault.write(args.path, args.content);
      return ok(`Wrote ${args.path} (${args.content.length} bytes).`);
    } catch (e) { return toToolError(e); }
  });

  server.registerTool('frontmatter_get', {
    title: 'Get frontmatter',
    description: 'Return the parsed YAML frontmatter of a note.',
    inputSchema: z.strictObject({ path: z.string() }),
  }, async (args) => {
    try {
      const fm = parseFrontmatter(await vault.read(await resolveAddress(vault, args.path)));
      const obj: Record<string, unknown> = {};
      if (fm) for (const p of fm.properties) obj[p.key] = p.value;
      return ok(JSON.stringify(obj, null, 2));
    } catch (e) { return toToolError(e); }
  });

  server.registerTool('frontmatter_set', {
    title: 'Set a frontmatter field',
    description: 'Set a single frontmatter key on a note (structure-preserving).',
    inputSchema: z.strictObject({
      path: z.string(),
      key: z.string(),
      value: z.union([z.string(), z.array(z.string()), z.boolean(), z.number()]),
    }),
  }, async (args) => {
    try {
      const updated = setProperty(await vault.read(args.path), args.key, args.value);
      await vault.write(args.path, updated);
      return ok(`Set ${args.key} on ${args.path}.`);
    } catch (e) { return toToolError(e); }
  });

  server.registerTool('memory_bank_read', {
    title: 'Read a Memory Bank file',
    description: 'Read a file under memory-bank/ (projectbrief, techContext, activeContext, progress, decisions/...).',
    inputSchema: z.strictObject({ file: z.string() }),
  }, async (args) => {
    try {
      const rel = args.file.startsWith('memory-bank/') ? args.file : `memory-bank/${args.file}`;
      return ok(await vault.read(rel));
    } catch (e) { return toToolError(e); }
  });

  server.registerTool('memory_bank_update', {
    title: 'Update a Memory Bank file (durable, provenance-stamped)',
    description: 'Append content under a heading in a memory-bank/ file. Durable write: stamped with provenance for review (anti-poisoning); never clobbers.',
    inputSchema: z.strictObject({ file: z.string(), heading: z.string(), content: z.string() }),
  }, async (args) => {
    try {
      const rel = args.file.startsWith('memory-bank/') ? args.file : `memory-bank/${args.file}`;
      const existing = (await vault.exists(rel)) ? await vault.read(rel) : '';
      const stamp = `<!-- provenance: mcp · ${new Date().toISOString()} · review before trusting -->`;
      const block = `${args.content.trim()}\n${stamp}`;
      await vault.write(rel, appendUnderHeading(existing, args.heading, block));
      return ok(`Recorded under "${args.heading}" in ${rel} (provenance-stamped).`);
    } catch (e) { return toToolError(e); }
  });

  server.registerTool('hot_read', {
    title: 'Read hot.md',
    description: 'Read the vault hot.md anchor (the recommended first read).',
    inputSchema: z.strictObject({}),
  }, async () => {
    try { return ok(await vault.read('hot.md')); } catch (e) { return toToolError(e); }
  });

  server.registerTool('spec_read', {
    title: 'Read a spec',
    description: 'Read specs/<feature>/spec.md, or list available specs when no feature is given.',
    inputSchema: z.strictObject({ feature: z.string().optional() }),
  }, async (args) => {
    try {
      if (args.feature) return ok(await vault.read(`specs/${args.feature}/spec.md`));
      const specs = (await vault.list('.md')).filter((p) => p.startsWith('specs/'));
      return ok(JSON.stringify(specs, null, 2));
    } catch (e) { return toToolError(e); }
  });

  return { server, vault };
}

/** stdio entry point. Vault root from argv[2] or ALFRED_VAULT. */
export async function main(): Promise<void> {
  const vaultRoot = process.argv[2] ?? process.env.ALFRED_VAULT;
  if (!vaultRoot) {
    process.stderr.write('Alfred MCP server: provide the vault root as argv[2] or ALFRED_VAULT.\n');
    process.exit(2);
  }
  const { connect, transportConfigFromEnv } = await import('./transport');
  const { server } = createAlfredMcpServer(vaultRoot);
  const conn = await connect(server, transportConfigFromEnv());
  process.stderr.write(`Alfred MCP server (${SERVER_NAME} ${SERVER_VERSION}, spec ${PROTOCOL_VERSION}) on ${conn.kind}; vault: ${vaultRoot}\n`);
}
