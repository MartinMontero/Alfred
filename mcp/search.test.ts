// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { searchVault, type SearchNote } from './search';

const fm = (id: string, desc: string, tags: string, domain: string) =>
  `---\nid: ${id}\ndescription: ${desc}\ntags: ${tags}\ndomain: ${domain}\nupdated: 2026-06-25\n---\n`;

const notes: SearchNote[] = [
  { path: 'memory-bank/progress.md', content: fm('progress', 'What works and what is left', '[memory-bank, progress]', 'memory-bank') + '\nShipped the nostr migration.\n' },
  { path: 'brain/RULES.md', content: fm('rules', 'Hard working rules', '[brain, rules]', 'brain') + '\nLinks to [[memory-bank/progress]].\n' },
  { path: 'inbox/idea.md', content: fm('idea', 'A raw capture about search', '[inbox]', 'inbox') + '\nsearch is fun\n' },
];

describe('searchVault', () => {
  it('matches free text in the body', () => {
    const hits = searchVault(notes, 'nostr');
    expect(hits.map((h) => h.path)).toContain('memory-bank/progress.md');
  });

  it('matches frontmatter description', () => {
    const hits = searchVault(notes, 'capture');
    expect(hits[0].path).toBe('inbox/idea.md');
    expect(hits[0].matched).toContain('description');
  });

  it('filters by tag and by domain', () => {
    expect(searchVault(notes, 'search', { tag: 'inbox' }).map((h) => h.path)).toEqual(['inbox/idea.md']);
    expect(searchVault(notes, '', { domain: 'brain' }).map((h) => h.path)).toEqual(['brain/RULES.md']);
  });

  it('is backlink-aware', () => {
    const hit = searchVault(notes, 'progress').find((h) => h.path === 'memory-bank/progress.md');
    expect(hit?.backlinks).toContain('brain/RULES.md');
  });
});
