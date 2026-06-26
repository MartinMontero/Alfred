// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * AI Librarian — Proposal-First (Phase 2 — agentic vault).
 *
 * Operationalizes the Proposal-First Librarian from
 * docs/research/agentic-pkm-architecture.md: it audits link health and suggests
 * structure/extractions, but **never writes without explicit human approval**.
 *
 * The guarantee is structural, not advisory:
 *   - `auditVault` is pure and read-only — it returns proposals and does not
 *     mutate its inputs.
 *   - There is no implicit write path. The only mutator, `applyApprovedProposal`,
 *     THROWS `LibrarianWriteRefused` unless an explicit `{ approved: true }` token
 *     is passed. So an unprompted call cannot change a note.
 */

import { parseFrontmatter } from '../frontmatter';
import { extractWikilinks, findMalformedWikilinks, validateNoteContent } from './frontmatter-schema';

export interface VaultNote {
  /** Vault-relative POSIX path, e.g. "memory-bank/progress.md". */
  path: string;
  content: string;
}

export type ProposalKind =
  | 'broken-link'
  | 'malformed-link'
  | 'orphan'
  | 'invalid-frontmatter'
  | 'extract-evergreen';

export interface Proposal {
  kind: ProposalKind;
  /** The note the proposal concerns. */
  path: string;
  /** Human-readable description of what was found. */
  detail: string;
  /** What the Librarian *suggests* — never auto-applied. */
  suggestion: string;
}

const EVERGREEN_WORD_LIMIT = 600;

function stripExt(p: string): string {
  return p.replace(/\.md$/i, '');
}
function basename(p: string): string {
  return stripExt(p).split('/').pop() ?? p;
}
function bodyOf(content: string): string {
  const fm = parseFrontmatter(content);
  if (!fm) return content;
  return content.split('\n').slice(fm.endLine + 1).join('\n');
}

/** Build the set of keys a [[wikilink]] may resolve to (path, basename, id). */
function resolvableKeys(notes: VaultNote[]): Set<string> {
  const keys = new Set<string>();
  for (const n of notes) {
    keys.add(stripExt(n.path).toLowerCase());
    keys.add(basename(n.path).toLowerCase());
    const fm = parseFrontmatter(n.content);
    const id = fm?.properties.find((p) => p.key === 'id')?.value;
    if (typeof id === 'string') keys.add(id.toLowerCase());
  }
  return keys;
}

function isExemptFromOrphan(path: string): boolean {
  const b = basename(path).toLowerCase();
  return b === 'hot' || b === 'readme' || path.toLowerCase().startsWith('brain/');
}

/**
 * Audit the vault and return proposals. PURE and READ-ONLY: it never mutates the
 * input notes (verified by tests) and returns suggestions only.
 */
export function auditVault(notes: VaultNote[]): Proposal[] {
  const proposals: Proposal[] = [];
  const keys = resolvableKeys(notes);

  // Inbound-link tally for orphan detection.
  const inbound = new Map<string, number>();
  for (const n of notes) inbound.set(stripExt(n.path).toLowerCase(), 0);

  for (const note of notes) {
    // Frontmatter health.
    const v = validateNoteContent(note.content);
    if (!v.valid) {
      proposals.push({
        kind: 'invalid-frontmatter',
        path: note.path,
        detail: v.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
        suggestion: 'Fix the load-bearing frontmatter (id, description, tags, domain, updated).',
      });
    }

    // Malformed wikilinks.
    for (const m of findMalformedWikilinks(note.content)) {
      proposals.push({ kind: 'malformed-link', path: note.path, detail: m, suggestion: 'Repair the bracket syntax.' });
    }

    // Broken + inbound links.
    for (const target of extractWikilinks(note.content)) {
      const norm = target.toLowerCase();
      const resolved = keys.has(norm) || keys.has(basename(norm));
      if (!resolved) {
        proposals.push({
          kind: 'broken-link',
          path: note.path,
          detail: `[[${target}]] resolves to no note.`,
          suggestion: `Create the target, fix the link, or remove it.`,
        });
      } else {
        const key = keys.has(norm) ? norm : basename(norm);
        // Best-effort: credit the inbound link to a matching note path key.
        for (const k of inbound.keys()) {
          if (k === key || basename(k) === key) inbound.set(k, (inbound.get(k) ?? 0) + 1);
        }
      }
    }

    // Evergreen extraction suggestion.
    const words = (bodyOf(note.content).match(/\S+/g) || []).length;
    const headings = (bodyOf(note.content).match(/^##\s+/gm) || []).length;
    if (words > EVERGREEN_WORD_LIMIT && headings >= 3) {
      proposals.push({
        kind: 'extract-evergreen',
        path: note.path,
        detail: `${words} words across ${headings} sections.`,
        suggestion: 'Consider extracting sections into atomic, linkable notes.',
      });
    }
  }

  // Orphans.
  for (const note of notes) {
    if (isExemptFromOrphan(note.path)) continue;
    const key = stripExt(note.path).toLowerCase();
    if ((inbound.get(key) ?? 0) === 0) {
      proposals.push({
        kind: 'orphan',
        path: note.path,
        detail: 'No other note links here.',
        suggestion: 'Link it from a relevant note (e.g. a domain index or hot.md) or archive it.',
      });
    }
  }

  return proposals;
}

export class LibrarianWriteRefused extends Error {
  constructor() {
    super('Librarian is Proposal-First: a write requires explicit { approved: true } human approval.');
    this.name = 'LibrarianWriteRefused';
  }
}

export interface Approval {
  approved: boolean;
}

/**
 * The ONLY mutator. Refuses to change anything unless explicitly approved by a
 * human. This is what makes the Librarian Proposal-First in code, not just by
 * convention. Returns the new note content for the caller to persist.
 */
export function applyApprovedProposal(suggestedContent: string, approval: Approval): string {
  if (!approval || approval.approved !== true) {
    throw new LibrarianWriteRefused();
  }
  return suggestedContent;
}
