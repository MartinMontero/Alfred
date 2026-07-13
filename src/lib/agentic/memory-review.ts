// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Memory-poisoning review gate (Phase 5 Step 7).
 *
 * Threat (docs/threat-model.md §2): durable memory is what biases every future
 * agent turn. If an agent — or text an agent ingested — can silently write a
 * false or authority-overriding "fact" into memory-bank/, it poisons the well.
 * The Phase-2 promotion path (`promote`) routes stable facts into durable files;
 * the MCP write path provenance-stamps them. This gate adds the missing
 * discipline: **agent-authored facts are never auto-promoted — they queue for
 * human review**, and anything carrying an obfuscation or authority-override
 * signal is held regardless of source.
 *
 * Honest boundary: this cannot detect a false fact stated in plain, visible,
 * authoritative-sounding language — that is what human review (the queue) is
 * for. The heuristics close the SILENT and OBFUSCATED channels; the queue
 * carries the rest. Pure / testable; no I/O.
 */

import { sanitize } from '../security/invisible-chars';
import { entryKind, type MemoryEntry, type MemoryKind } from './memory';

/** Who authored a candidate memory. User-authored facts are trusted to promote;
 *  agent-authored facts must be reviewed before becoming durable truth. */
export type MemorySource = 'user' | 'agent';

export type ReviewVerdict = 'auto-promote' | 'needs-review' | 'reject';

export interface ReviewResult {
  verdict: ReviewVerdict;
  /** Machine-readable reason codes (stable for tests/telemetry). */
  reasons: string[];
  /** Obfuscation findings from the shared sanitizer, if any. */
  obfuscation: ReturnType<typeof sanitize>['findings'];
}

// Authority-override / injection phrasing: a "memory" that tries to rewrite the
// rules rather than record a fact. Matches the classic prompt-injection frames.
const AUTHORITY_OVERRIDE =
  /\b(ignore (all |any )?(previous|prior|above)|disregard (the )?(above|previous|earlier)|system prompt|you must (always|never)|from now on,? (always|never|ignore)|the constitution now|override (the )?(rules|policy|constitution)|new instructions?:|act as (if|though))\b/i;

// A durable "fact" that claims to relax the vendor exclusion or the permission
// model is high-risk poisoning regardless of who wrote it.
const POLICY_TAMPER =
  /\b(allow (openai|meta|xai)|enable (openai|meta|xai)|disable the (denylist|permission|provider) (gate|lockdown|check)|auto-?approve (all|every) tool|grant shell access)\b/i;

/**
 * Review one candidate durable memory. `reject` for an obfuscation or
 * policy-tamper signal (never promote, even from the user without an explicit
 * out-of-band override); `needs-review` for agent-authored or authority-override
 * phrasing; `auto-promote` only for clean, user-authored stable facts.
 */
export function reviewMemory(entry: MemoryEntry, source: MemorySource): ReviewResult {
  const reasons: string[] = [];
  const { findings } = sanitize(entry.text);
  const obfuscation = findings;

  if (findings.length > 0) reasons.push('obfuscation-characters');
  if (POLICY_TAMPER.test(entry.text)) reasons.push('policy-tamper');
  if (AUTHORITY_OVERRIDE.test(entry.text)) reasons.push('authority-override');

  // Hard reject: an obfuscated write or an attempt to relax a security control
  // never becomes durable memory automatically, whoever authored it.
  if (reasons.includes('obfuscation-characters') || reasons.includes('policy-tamper')) {
    return { verdict: 'reject', reasons, obfuscation };
  }

  if (source === 'agent') reasons.push('agent-authored');

  // Anything agent-authored, or carrying authority-override phrasing, is held
  // for human review — never silently promoted.
  if (reasons.length > 0) {
    return { verdict: 'needs-review', reasons, obfuscation };
  }

  return { verdict: 'auto-promote', reasons, obfuscation };
}

export interface GatedPromotion {
  entry: MemoryEntry;
  kind: Exclude<MemoryKind, 'chatter'>;
  source: MemorySource;
  review: ReviewResult;
}

export interface PromotionGateResult {
  /** Clean, user-authored stable facts — safe to write to memory-bank/. */
  autoPromote: GatedPromotion[];
  /** Held for explicit human approval before they become durable. */
  needsReview: GatedPromotion[];
  /** Refused outright (obfuscation / policy-tamper). */
  rejected: GatedPromotion[];
}

/**
 * Partition a set of stable-fact candidates by review verdict. Chatter is not a
 * durable-memory candidate and is ignored here (see `promote`); only stable
 * facts reach the gate. Callers write `autoPromote`, surface `needsReview` in
 * the review UI, and log `rejected` (never write).
 */
export function gatePromotions(
  candidates: Array<{ entry: MemoryEntry; source: MemorySource }>,
): PromotionGateResult {
  const out: PromotionGateResult = { autoPromote: [], needsReview: [], rejected: [] };
  for (const { entry, source } of candidates) {
    const kind = entryKind(entry);
    if (kind === 'chatter') continue; // not a durable candidate
    const review = reviewMemory(entry, source);
    const gated: GatedPromotion = { entry, kind, source, review };
    if (review.verdict === 'auto-promote') out.autoPromote.push(gated);
    else if (review.verdict === 'needs-review') out.needsReview.push(gated);
    else out.rejected.push(gated);
  }
  return out;
}
