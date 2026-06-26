// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Tiered memory discipline (Phase 2 — agentic vault).
 *
 * Operationalizes the Hermes tiered-memory model from
 * docs/research/agentic-pkm-architecture.md:
 *   - Tier 1 "Hot memory": a small working buffer (~6,000 chars).
 *   - At ~67% capacity, promote *stable facts only* (decisions, preferences,
 *     failed approaches) into Tier 2 "living files" under memory-bank/.
 *   - Tier 3 "Daily notes" (daily/) is the permanent chronological record.
 *
 * Discipline: chatter is never promoted into durable memory. Pure / testable.
 */

export const HOT_BUFFER_LIMIT = 6000;
export const PROMOTION_RATIO = 0.67;
export const PROMOTION_THRESHOLD = Math.floor(HOT_BUFFER_LIMIT * PROMOTION_RATIO);

export type MemoryKind = 'decision' | 'preference' | 'failed-approach' | 'chatter';

/** Where each stable-fact kind is promoted within memory-bank/. */
export const MEMORY_TARGETS: Record<Exclude<MemoryKind, 'chatter'>, string> = {
  decision: 'memory-bank/decisions',
  preference: 'memory-bank/preferences.md',
  'failed-approach': 'memory-bank/progress.md',
};

export interface MemoryEntry {
  text: string;
  /** Optional explicit kind; otherwise inferred by classifyMemory. */
  kind?: MemoryKind;
}

const FAILED_SIGNALS = /\b(failed|fail|didn'?t work|doesn'?t work|broke|broken|regression|avoid|gotcha|pitfall|stop using|deprecat)/i;
const DECISION_SIGNALS = /\b(decided|decision|chose|choose|we will use|adopt|going with|settled on|agreed to)\b/i;
const PREFERENCE_SIGNALS = /\b(prefer|preference|always|never|by default|convention|style guide|i like|we like|standard is)\b/i;

/** Classify a memory entry. Order: failed-approach > decision > preference > chatter. */
export function classifyMemory(text: string): MemoryKind {
  if (FAILED_SIGNALS.test(text)) return 'failed-approach';
  if (DECISION_SIGNALS.test(text)) return 'decision';
  if (PREFERENCE_SIGNALS.test(text)) return 'preference';
  return 'chatter';
}

export function entryKind(entry: MemoryEntry): MemoryKind {
  return entry.kind ?? classifyMemory(entry.text);
}

/** A stable fact is anything that constrains future reasoning (i.e. not chatter). */
export function isStableFact(entry: MemoryEntry): boolean {
  return entryKind(entry) !== 'chatter';
}

/** Total character weight of a buffer. */
export function bufferSize(buffer: MemoryEntry[]): number {
  return buffer.reduce((n, e) => n + e.text.length, 0);
}

/** True once the hot buffer crosses the promotion threshold. */
export function shouldPromote(buffer: MemoryEntry[]): boolean {
  return bufferSize(buffer) >= PROMOTION_THRESHOLD;
}

export interface PromotionResult {
  /** Stable facts to write into memory-bank/, grouped by target file. */
  promoted: Array<{ entry: MemoryEntry; kind: Exclude<MemoryKind, 'chatter'>; target: string }>;
  /** Chatter that was dropped (never reaches durable memory). */
  discarded: MemoryEntry[];
  /** Whether anything was promoted. */
  promotedCount: number;
}

/**
 * Promote the buffer: stable facts are routed to their memory-bank target; chatter
 * is discarded. Callers clear the hot buffer afterward (the buffer is the working
 * tier, not the store).
 */
export function promote(buffer: MemoryEntry[]): PromotionResult {
  const promoted: PromotionResult['promoted'] = [];
  const discarded: MemoryEntry[] = [];

  for (const entry of buffer) {
    const kind = entryKind(entry);
    if (kind === 'chatter') {
      discarded.push(entry);
    } else {
      promoted.push({ entry, kind, target: MEMORY_TARGETS[kind] });
    }
  }

  return { promoted, discarded, promotedCount: promoted.length };
}
