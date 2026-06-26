// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Vault search (Phase 3 — Alfred MCP server): text + frontmatter + tag +
 * backlink-aware. Pure; reuses the existing frontmatter parser and the Phase-2
 * wikilink extractor rather than reimplementing them.
 */

import { parseFrontmatter } from '../src/lib/frontmatter';
import { extractWikilinks } from '../src/lib/agentic/frontmatter-schema';

export interface SearchNote {
  path: string;
  content: string;
}

export interface SearchHit {
  path: string;
  score: number;
  matched: string[];
  description?: string;
  backlinks: string[];
}

const stripExt = (p: string) => p.replace(/\.md$/i, '');
const basename = (p: string) => stripExt(p).split('/').pop() ?? p;

function frontmatterObject(content: string): Record<string, unknown> {
  const fm = parseFrontmatter(content);
  const obj: Record<string, unknown> = {};
  if (fm) for (const p of fm.properties) obj[p.key] = p.value;
  return obj;
}

export interface SearchOptions {
  tag?: string;
  domain?: string;
  limit?: number;
}

export function searchVault(notes: SearchNote[], query: string, opts: SearchOptions = {}): SearchHit[] {
  const q = query.trim().toLowerCase();

  // Inbound-link index for backlink awareness.
  const inbound = new Map<string, string[]>();
  for (const n of notes) {
    for (const target of extractWikilinks(n.content)) {
      const key = stripExt(target).toLowerCase();
      const list = inbound.get(key) ?? [];
      list.push(n.path);
      inbound.set(key, list);
    }
  }

  const hits: SearchHit[] = [];
  for (const n of notes) {
    const fm = frontmatterObject(n.content);
    const description = typeof fm.description === 'string' ? fm.description : '';
    const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
    const domain = typeof fm.domain === 'string' ? fm.domain : '';

    if (opts.tag && !tags.some((t) => t.toLowerCase() === opts.tag!.toLowerCase())) continue;
    if (opts.domain && domain.toLowerCase() !== opts.domain.toLowerCase()) continue;

    const matched: string[] = [];
    let score = 0;
    if (q) {
      if (n.path.toLowerCase().includes(q)) { matched.push('path'); score += 5; }
      if (description.toLowerCase().includes(q)) { matched.push('description'); score += 4; }
      if (tags.some((t) => t.toLowerCase().includes(q))) { matched.push('tag'); score += 4; }
      if (domain.toLowerCase().includes(q)) { matched.push('domain'); score += 2; }
      if (n.content.toLowerCase().includes(q)) { matched.push('body'); score += 1; }
    } else if (opts.tag || opts.domain) {
      matched.push('filter');
      score += 1;
    }
    if (score === 0) continue;

    const backlinks =
      inbound.get(stripExt(n.path).toLowerCase()) ?? inbound.get(basename(n.path).toLowerCase()) ?? [];
    hits.push({ path: n.path, score, matched, description: description || undefined, backlinks });
  }

  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return typeof opts.limit === 'number' ? hits.slice(0, opts.limit) : hits;
}
