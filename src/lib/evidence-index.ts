// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Evidence index — pure derivation layer for the shell-wide evidence surfaces
 * (sidebar band glyphs, the evidence filter, the Build Memory ledger).
 * Data before theory: everything here is read from note frontmatter via
 * parseEvidence; nothing is fabricated for unmarked notes — they are simply
 * absent from the index and render nothing.
 */
import { parseFrontmatter } from './frontmatter';
import { propertiesToObject } from './agentic/frontmatter-schema';
import { parseEvidence, isExpired, type EvidenceMeta } from './evidence';

export type EvidenceFilter = 'all' | 'marked' | 'attention';

export interface LedgerEntry {
  path: string;
  /** File name without the .md extension. */
  name: string;
  meta: EvidenceMeta;
  /** validFrom, falling back to validUntil — the date the ledger sorts on. */
  date: string | null;
  expired: boolean;
}

export function noteEvidence(content: string): EvidenceMeta {
  const parsed = parseFrontmatter(content);
  if (!parsed) return parseEvidence(undefined);
  return parseEvidence(propertiesToObject(parsed.properties));
}

/** Index only marked markdown notes; unmarked notes carry no entry at all. */
export function buildEvidenceIndex(files: Map<string, string>): Map<string, EvidenceMeta> {
  const index = new Map<string, EvidenceMeta>();
  for (const [path, content] of files) {
    if (!path.endsWith('.md')) continue;
    const meta = noteEvidence(content);
    if (!meta.unmarked) index.set(path, meta);
  }
  return index;
}

/**
 * Filter semantics (product vocabulary — confidence bands and flags, never the
 * build-loop vocabulary; two-layer rule in src/lib/evidence.ts):
 * - 'all': every note.
 * - 'marked': notes carrying evidence fields.
 * - 'attention': marked notes a builder should re-check — low band, unknown
 *   band with data issues, expired validity window, or invalidated.
 */
export function matchesEvidenceFilter(
  meta: EvidenceMeta | undefined,
  filter: EvidenceFilter,
  today: string,
): boolean {
  if (filter === 'all') return true;
  if (!meta || meta.unmarked) return false;
  if (filter === 'marked') return true;
  return (
    meta.invalidated !== null ||
    meta.band === 'low' ||
    (meta.band === 'unknown' && meta.issues.length > 0) ||
    meta.needsCaveat ||
    isExpired(meta, today)
  );
}

function baseName(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
  return name.replace(/\.md$/i, '');
}

/** Marked notes as ledger rows: dated first (newest first), then undated by name. */
export function ledgerEntries(index: Map<string, EvidenceMeta>, today: string): LedgerEntry[] {
  const rows: LedgerEntry[] = [];
  for (const [path, meta] of index) {
    rows.push({
      path,
      name: baseName(path),
      meta,
      date: meta.validFrom ?? meta.validUntil,
      expired: isExpired(meta, today),
    });
  }
  rows.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

/** Today's date in the ISO shape the evidence windows use (local time). */
export function isoToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
