// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Context probes (Phase 5 Step 6) — the deterministic guardrail on Alfred's
 * "Context Layer": the ground truth Alfred assembles for the agent must carry
 * the high-signal directives the agent needs, or the external mind isn't doing
 * its job.
 *
 * Three probes, from docs/research/atproto-case-study.md: **recall** (can the
 * agent remember specific facts?), **artifact** (does the agent know which files
 * it has modified?), **continuation** (can the agent resume a multi-step task?).
 *
 * These check the CONTEXT SUBSTRATE — the assembled text Alfred would hand the
 * agent (hot.md plus any pulled memory-bank/spec files) — NOT a live model
 * answer. A live-LLM probe would be provider spend and non-deterministic; the
 * value we can verify without either is "the fact/artifact/next-step is present
 * in the minimum-viable context we assemble." Presence is necessary for recall;
 * absence guarantees its failure. That is exactly what a CI gate can own.
 */

/** The assembled context handed to the agent: hot.md + any on-demand files. */
export interface ProbeContext {
  text: string;
}

export type ProbeKind = 'recall' | 'artifact' | 'continuation';

export interface ProbeResult {
  kind: ProbeKind;
  passed: boolean;
  /** Expectations present in the assembled context. */
  found: string[];
  /** Expectations NOT present — the reason a probe fails. */
  missing: string[];
}

export interface ProbeExpectations {
  /** Facts the agent must be able to recall (decisions, preferences, constraints). */
  recall: string[];
  /** File paths the agent must know it (or the session) has modified. */
  artifact: string[];
  /** The next actionable step(s) of an in-flight task the agent must resume. */
  continuation: string[];
}

/** Assemble the probe context from a hot.md snapshot plus any pulled files. */
export function assembleProbeContext(hotMarkdown: string, pulledFiles: string[] = []): ProbeContext {
  return { text: [hotMarkdown, ...pulledFiles].join('\n\n') };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Strip a `[[wikilink|alias]]` down to its target, and a path down to basename. */
function pathForms(raw: string): string[] {
  const inner = raw.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
  const noExt = inner.replace(/\.[a-z0-9]+$/i, '');
  const base = inner.split(/[\\/]/).pop() ?? inner;
  const baseNoExt = base.replace(/\.[a-z0-9]+$/i, '');
  return Array.from(new Set([inner, noExt, base, baseNoExt].map(normalize).filter(Boolean)));
}

/** True if the assembled context contains `needle` (whitespace/case-insensitive). */
function contains(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

/** True if the context references a file by any of its path forms. */
function containsPath(haystack: string, rawPath: string): boolean {
  const hay = normalize(haystack);
  return pathForms(rawPath).some((form) => form.length > 0 && hay.includes(form));
}

function build(kind: ProbeKind, expectations: string[], hit: (e: string) => boolean): ProbeResult {
  const found: string[] = [];
  const missing: string[] = [];
  for (const e of expectations) (hit(e) ? found : missing).push(e);
  return { kind, passed: missing.length === 0, found, missing };
}

/** Recall: every required fact must be present in the assembled context. */
export function recallProbe(ctx: ProbeContext, facts: string[]): ProbeResult {
  return build('recall', facts, (f) => contains(ctx.text, f));
}

/** Artifact: every modified-file path must be referenced in the context. */
export function artifactProbe(ctx: ProbeContext, modifiedPaths: string[]): ProbeResult {
  return build('artifact', modifiedPaths, (p) => containsPath(ctx.text, p));
}

/** Continuation: every next-step of the in-flight task must be present. */
export function continuationProbe(ctx: ProbeContext, nextSteps: string[]): ProbeResult {
  return build('continuation', nextSteps, (s) => contains(ctx.text, s));
}

export interface ProbeRun {
  results: ProbeResult[];
  allPassed: boolean;
}

/** Run all three probes against one assembled context. */
export function runContextProbes(ctx: ProbeContext, exp: ProbeExpectations): ProbeRun {
  const results = [
    recallProbe(ctx, exp.recall),
    artifactProbe(ctx, exp.artifact),
    continuationProbe(ctx, exp.continuation),
  ];
  return { results, allPassed: results.every((r) => r.passed) };
}
