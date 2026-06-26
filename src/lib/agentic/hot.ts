// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * hot.md — the progressive-disclosure anchor (Phase 2 — agentic vault).
 *
 * Operationalizes the hot.md paradigm from
 * docs/research/agentic-pkm-architecture.md: a ~500-word, current-state snapshot
 * at the vault root, written almost entirely as [[wikilinks]], that an agent
 * reads first. It collapses startup context to ~2-4k tokens while preserving
 * access to "infinite depth" by linking out instead of inlining.
 *
 * Pure: `generateHotMd` (state -> markdown) and `parseHotMd` (markdown -> state)
 * are inverse, so hot.md round-trips and can be refreshed by a command or a
 * session-end hook without losing structure. No @platform / DOM dependency.
 */

import { buildFrontmatter } from './frontmatter-schema';

export const HOT_WORD_TARGET = 500;
export const HOT_TOKENS_MIN = 2000;
export const HOT_TOKENS_MAX = 4000;

/** Ordered sections of hot.md and the state field each maps to. */
const SECTIONS = [
  { heading: 'Current focus', field: 'focus' },
  { heading: 'Recent decisions', field: 'recentDecisions' },
  { heading: 'Open loops', field: 'openLoops' },
  { heading: 'Prerequisites', field: 'prerequisites' },
  { heading: 'Anchors', field: 'anchors' },
] as const;

export interface HotState {
  /** Human project name. */
  project: string;
  /** ISO date the snapshot was generated. */
  updated: string;
  /** Immediate focus areas (each ideally a [[wikilink]]). */
  focus: string[];
  /** Recent architectural decisions (link to memory-bank/decisions). */
  recentDecisions: string[];
  /** Unfinished threads. */
  openLoops: string[];
  /** What the next session needs in hand before starting. */
  prerequisites: string[];
  /** Stable entry points into the vault. */
  anchors: string[];
}

export function emptyHotState(project = 'Untitled', updated = isoToday()): HotState {
  return {
    project,
    updated,
    focus: [],
    recentDecisions: [],
    openLoops: [],
    prerequisites: [],
    anchors: ['[[brain/NORTH_STAR]]', '[[brain/constitution]]', '[[memory-bank/activeContext]]', '[[memory-bank/progress]]'],
  };
}

function isoToday(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function bullets(items: string[]): string {
  if (items.length === 0) return '- _(none yet)_';
  return items.map((i) => `- ${i.trim()}`).join('\n');
}

/** Rough token estimate (~4 chars/token) — good enough for the budget guardrail. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

/** Generate the hot.md markdown for a given state. */
export function generateHotMd(state: HotState): string {
  const fm = buildFrontmatter({
    id: 'hot',
    description: `Current-state anchor for ${state.project}: focus, recent decisions, open loops. Read first; follow wikilinks for depth.`.slice(0, 150),
    tags: ['hot', 'anchor', 'startup'],
    domain: 'brain',
    updated: state.updated,
  });

  const body = [
    `# hot.md — ${state.project}`,
    '',
    '> ~500-word startup anchor. Read this first; follow the [[wikilinks]] for depth instead of loading the whole vault.',
    '',
    ...SECTIONS.flatMap(({ heading, field }) => [`## ${heading}`, bullets(state[field] as string[]), '']),
  ].join('\n');

  return `${fm}\n\n${body.trimEnd()}\n`;
}

/** Parse hot.md markdown back into state (inverse of generateHotMd). */
export function parseHotMd(markdown: string): HotState {
  // Strip the frontmatter block, but preserve its `updated` date so the
  // generate -> parse -> generate cycle is stable.
  let body = markdown;
  let updatedFromFm: string | null = null;
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3);
    if (end !== -1) {
      const m = body.slice(0, end).match(/^updated:\s*(.+)$/m);
      if (m) updatedFromFm = m[1].trim().replace(/^["']|["']$/g, '');
      const after = body.indexOf('\n', end + 1);
      body = after !== -1 ? body.slice(after + 1) : '';
    }
  }

  const lines = body.split('\n');
  const state = emptyHotState();
  if (updatedFromFm) state.updated = updatedFromFm;
  state.anchors = []; // parsed, not defaulted

  // Project name from the H1 ("# hot.md — <project>").
  const h1 = lines.find((l) => l.startsWith('# '));
  if (h1) {
    const m = h1.match(/#\s*hot\.md\s*[—-]\s*(.+)$/);
    if (m) state.project = m[1].trim();
  }

  const headingToField = new Map(SECTIONS.map((s) => [s.heading.toLowerCase(), s.field]));
  let current: (typeof SECTIONS)[number]['field'] | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      const field = headingToField.get(h[1].trim().toLowerCase());
      current = field ?? null;
      continue;
    }
    if (current && /^\s*-\s+/.test(line)) {
      const item = line.replace(/^\s*-\s+/, '').trim();
      if (item && item !== '_(none yet)_') (state[current] as string[]).push(item);
    }
  }
  return state;
}

/** Whether a generated hot.md sits inside the intended startup-token budget. */
export function isWithinBudget(markdown: string): boolean {
  const t = estimateTokens(markdown);
  return t <= HOT_TOKENS_MAX;
}
