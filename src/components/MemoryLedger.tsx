// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Build Memory — the workshop's commonplace book. A vault-backed ledger of
 * every note that carries evidence frontmatter: dated, confidence-graded,
 * source-counted, invalidations visible (never deleted). Reads the same
 * in-memory content cache the sidebar search uses — zero IPC, no new state.
 * Notes without evidence fields are absent by design: the ledger shows what
 * the builder has graded, not a fabricated history.
 */
import { For, Show, createMemo, type Component } from 'solid-js';
import { buildEvidenceIndex, isoToday, ledgerEntries } from '../lib/evidence-index';
import EvidenceBadge from './EvidenceBadge';

interface MemoryLedgerProps {
  fileContents: Map<string, string>;
  vaultPath: string | null;
  onOpenNote: (path: string) => void;
}

const MemoryLedger: Component<MemoryLedgerProps> = (props) => {
  const today = isoToday();
  const rows = createMemo(() => {
    const index = buildEvidenceIndex(props.fileContents);
    return ledgerEntries(index, today);
  });

  const relPath = (path: string) => {
    const vault = props.vaultPath;
    if (!vault) return path;
    const norm = path.replace(/\\/g, '/');
    const vaultNorm = vault.replace(/\\/g, '/');
    return norm.startsWith(vaultNorm) ? norm.slice(vaultNorm.length).replace(/^\//, '') : path;
  };

  return (
    <div class="memory-ledger" data-register="workshop">
      <div class="memory-ledger__header">
        <h2>Build Memory</h2>
        <span class="memory-ledger__count">
          {rows().length} graded {rows().length === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      <p class="memory-ledger__intro">
        Decisions and findings you have graded, in one dated ledger. Every entry reads its state
        from the note's own properties — nothing here is inferred.
      </p>
      <Show
        when={rows().length > 0}
        fallback={
          <div class="memory-ledger__empty">
            No graded entries yet. Add evidence fields (confidence, sources, validity window) to a
            note's properties and it appears here.
          </div>
        }
      >
        <div class="memory-ledger__rows">
          <For each={rows()}>
            {(row) => (
              <button
                type="button"
                class="memory-ledger__row"
                classList={{ 'memory-ledger__row--invalidated': row.meta.invalidated !== null }}
                onClick={() => props.onOpenNote(row.path)}
              >
                <span class="memory-ledger__date">{row.date ?? '· · ·'}</span>
                <span class="memory-ledger__name">{row.name}</span>
                <span class="memory-ledger__badge">
                  <EvidenceBadge meta={row.meta} />
                  <Show when={row.expired}>
                    <span class="memory-ledger__expired">window lapsed</span>
                  </Show>
                </span>
                <span class="memory-ledger__meta">
                  {row.meta.sources.length > 0
                    ? `${row.meta.sources.length} source${row.meta.sources.length === 1 ? '' : 's'}`
                    : 'no sources'}
                  {' · '}
                  {relPath(row.path)}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default MemoryLedger;
