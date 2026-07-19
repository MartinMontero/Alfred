// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Home — the Morning Study (ratified Direction 1, 2026-07-19). The app's front
 * door: a greeting in the builder's own chosen name, a capture box that turns
 * a thought into a note, the session's open notes, the agent at rest, Build
 * Memory highlights, and three ways to start. Every line reads real state —
 * nothing on this surface is invented.
 */
import { For, Show, createMemo, createSignal, type Component } from 'solid-js';
import { buildEvidenceIndex, isoToday, ledgerEntries } from '../lib/evidence-index';
import { greeting } from '../lib/display-name';
import EvidenceBadge from './EvidenceBadge';

interface HomeProps {
  vaultPath: string | null;
  vaultName: string;
  fileContents: Map<string, string>;
  /** Open notes from the session — genuinely "where you left off". */
  openNotes: { path: string; name: string }[];
  agentPresence: 'idle' | 'live';
  /** Desktop only — the agent card hides on web/mobile. */
  showAgentCard: boolean;
  onOpenNote: (path: string) => void;
  onCreateNote: () => void;
  onCaptureNote: (text: string) => void;
  onOpenDailyNote: () => void;
  onOpenMemory: () => void;
  onOpenNotesPanel: () => void;
  onStartAgent: () => void;
}

const Home: Component<HomeProps> = (props) => {
  const [capture, setCapture] = createSignal('');
  const today = isoToday();

  const ledger = createMemo(() =>
    ledgerEntries(buildEvidenceIndex(props.fileContents), today),
  );
  const evidenceFor = (path: string) => ledger().find((r) => r.path === path)?.meta;

  const noteCount = () => {
    let n = 0;
    for (const p of props.fileContents.keys()) if (p.endsWith('.md')) n++;
    return n;
  };

  const subline = () => {
    const notes = noteCount();
    const graded = ledger().length;
    const parts = [`${notes} ${notes === 1 ? 'note' : 'notes'} in ${props.vaultName}`];
    if (graded > 0) parts.push(`${graded} graded ${graded === 1 ? 'decision' : 'decisions'}`);
    return `${parts.join(' · ')}. Everything stays on this machine.`;
  };

  // Fall back to vault notes when the session has nothing open; the card
  // heading follows so the label never overclaims.
  const recents = createMemo(() => {
    if (props.openNotes.length > 0) return { title: 'Pick up where you left off', rows: props.openNotes.slice(0, 4) };
    const rows: { path: string; name: string }[] = [];
    for (const p of props.fileContents.keys()) {
      if (!p.endsWith('.md')) continue;
      const name = p.replace(/\\/g, '/').split('/').pop()!.replace(/\.md$/i, '');
      rows.push({ path: p, name });
      if (rows.length >= 4) break;
    }
    return { title: 'In your vault', rows };
  });

  const submitCapture = () => {
    const text = capture().trim();
    if (!text) return;
    props.onCaptureNote(text);
    setCapture('');
  };

  const greet = greeting();

  return (
    <div class="home" data-register="workshop">
      <h1 class="home__greet">{greet}</h1>
      <p class="home__sub">{subline()}</p>

      <div class="home__capture">
        <input
          value={capture()}
          onInput={(e) => setCapture(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitCapture(); }}
          placeholder={`Capture a thought — it becomes a note in ${props.vaultName}…`}
          aria-label="Capture a thought"
        />
        <button disabled={!capture().trim()} onClick={submitCapture}>Save</button>
      </div>

      <div class="home__cards">
        <section class="home-card home-card--recents">
          <h2>{recents().title} <button class="home-card__more" onClick={props.onOpenNotesPanel}>All notes →</button></h2>
          <Show
            when={recents().rows.length > 0}
            fallback={<p class="home-card__empty">No notes yet — capture a thought above, or start one below.</p>}
          >
            <For each={recents().rows}>
              {(n) => (
                <button class="home-note" onClick={() => props.onOpenNote(n.path)}>
                  <span class="home-note__t">{n.name}</span>
                  <Show when={evidenceFor(n.path)}>
                    {(m) => <EvidenceBadge meta={m()} />}
                  </Show>
                </button>
              )}
            </For>
          </Show>
        </section>

        <Show when={props.showAgentCard}>
          <section class="home-card home-card--agent" data-register="instrument">
            <h2>Agent</h2>
            <div class="home-agent__state">
              <span class="home-agent__dot" classList={{ 'home-agent__dot--live': props.agentPresence === 'live' }}></span>
              <div>
                <b>{props.agentPresence === 'live' ? 'Session live.' : 'Resting.'}</b>
                <small>
                  {props.agentPresence === 'live'
                    ? 'Reads are free; anything that writes or runs a command asks you first.'
                    : 'Nothing runs until you ask. Reads are free; writes ask first.'}
                </small>
              </div>
            </div>
            <button class="home-agent__cta" onClick={props.onStartAgent}>
              {props.agentPresence === 'live' ? 'Open the session' : 'Start a session'}
            </button>
          </section>
        </Show>

        <section class="home-card home-card--wide">
          <h2>Build Memory — what you've settled <button class="home-card__more" onClick={props.onOpenMemory}>Open the ledger →</button></h2>
          <Show
            when={ledger().length > 0}
            fallback={
              <p class="home-card__empty">
                Grade a note's confidence in its properties and it takes its place here.
              </p>
            }
          >
            <For each={ledger().slice(0, 3)}>
              {(row) => (
                <button class="home-mem" onClick={() => props.onOpenNote(row.path)}>
                  <span class="home-mem__d">{row.date ?? '· · ·'}</span>
                  <span class="home-mem__t">{row.name}</span>
                  <span class="home-mem__b"><EvidenceBadge meta={row.meta} /></span>
                </button>
              )}
            </For>
          </Show>
        </section>

        <section class="home-card home-card--wide">
          <h2>Start something</h2>
          <div class="home-tiles">
            <button class="home-tile" onClick={props.onCreateNote}>
              <b>New note</b><span>A blank page in {props.vaultName}</span>
            </button>
            <button class="home-tile" onClick={props.onOpenDailyNote}>
              <b>Daily note</b><span>Today, dated automatically</span>
            </button>
            <Show
              when={props.showAgentCard}
              fallback={
                <button class="home-tile" onClick={props.onOpenNotesPanel}>
                  <b>Search notes</b><span>Find anything in your vault</span>
                </button>
              }
            >
              <button class="home-tile" onClick={props.onStartAgent}>
                <b>Ask the agent</b><span>About anything in your vault</span>
              </button>
            </Show>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
