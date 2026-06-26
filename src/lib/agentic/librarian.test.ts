// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  auditVault,
  applyApprovedProposal,
  LibrarianWriteRefused,
  type VaultNote,
} from './librarian';

const fm = (id: string, desc: string) =>
  `---\nid: ${id}\ndescription: ${desc}\ntags: [t]\ndomain: d\nupdated: 2026-06-25\n---\n`;

const notes: VaultNote[] = [
  { path: 'a.md', content: fm('a', 'Links to a real and a ghost note') + '\nSee [[b]] and [[ghost]].\n' },
  { path: 'b.md', content: fm('b', 'A linked target note') + '\nbody\n' },
  { path: 'orphan.md', content: fm('orphan', 'Nothing links here') + '\nalone\n' },
  { path: 'bad.md', content: '# no frontmatter at all\n' },
];

describe('Librarian — audits and proposes', () => {
  const proposals = auditVault(notes);

  it('flags a broken wikilink', () => {
    expect(proposals.some((p) => p.kind === 'broken-link' && p.detail.includes('ghost'))).toBe(true);
  });

  it('flags a note with invalid/missing frontmatter', () => {
    expect(proposals.some((p) => p.kind === 'invalid-frontmatter' && p.path === 'bad.md')).toBe(true);
  });

  it('flags an orphan (no inbound links)', () => {
    expect(proposals.some((p) => p.kind === 'orphan' && p.path === 'orphan.md')).toBe(true);
  });

  it('does NOT flag a note that is linked to', () => {
    expect(proposals.some((p) => p.kind === 'orphan' && p.path === 'b.md')).toBe(false);
  });
});

describe('Librarian — Proposal-First is structural, not advisory', () => {
  it('auditVault is read-only: it never mutates the input notes', () => {
    const before = JSON.parse(JSON.stringify(notes));
    auditVault(notes);
    expect(notes).toEqual(before);
  });

  it('refuses to write without explicit approval', () => {
    expect(() => applyApprovedProposal('new', { approved: false })).toThrow(LibrarianWriteRefused);
    // @ts-expect-error — exercising the runtime guard against a missing approval token.
    expect(() => applyApprovedProposal('new', undefined)).toThrow(LibrarianWriteRefused);
  });

  it('writes only when a human explicitly approves', () => {
    expect(applyApprovedProposal('new', { approved: true })).toBe('new');
  });
});
