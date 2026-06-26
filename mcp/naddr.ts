// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * NIP-19 naddr addressing for vault resources (Phase 3 — Alfred MCP server).
 *
 * A vault note can be addressed by path OR by NIP-19 `naddr`. The naddr's
 * identifier (the NIP-01 `d` tag) maps to a note's load-bearing frontmatter
 * `id`. Reuses nostr-tools `nip19` (no reimplementation). The vault file kind is
 * 30800 (preserved from the cloned base; see src/lib/nostr/types.ts).
 */

import { nip19 } from 'nostr-tools';

export const KIND_FILE = 30800;

export interface DecodedNaddr {
  identifier: string;
  kind: number;
  pubkey: string;
  relays?: string[];
}

export function isNaddr(s: string): boolean {
  return /^naddr1[0-9a-z]+$/i.test(s.trim());
}

export function decodeNaddr(naddr: string): DecodedNaddr {
  const decoded = nip19.decode(naddr.trim());
  if (decoded.type !== 'naddr') {
    throw new Error(`Not an naddr: "${naddr}".`);
  }
  const a = decoded.data as { identifier: string; kind: number; pubkey: string; relays?: string[] };
  return { identifier: a.identifier, kind: a.kind, pubkey: a.pubkey, relays: a.relays };
}

export function encodeNaddr(identifier: string, pubkey: string, kind = KIND_FILE, relays: string[] = []): string {
  return nip19.naddrEncode({ identifier, pubkey, kind, relays });
}

/**
 * Resolve an naddr's identifier to a vault note. Match on frontmatter `id`
 * first; fall back to treating the identifier as a vault-relative path.
 */
export function resolveIdentifierToPath(
  identifier: string,
  notes: Array<{ path: string; id?: string }>,
): string | null {
  const byId = notes.find((n) => n.id !== undefined && n.id === identifier);
  if (byId) return byId.path;
  const byPath = notes.find((n) => n.path === identifier || n.path === `${identifier}.md`);
  return byPath ? byPath.path : null;
}
