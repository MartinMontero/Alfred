// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Analytical surface — the desktop bridge to the compiled holmes-core
 * projection (src-tauri/src/analytical.rs). Pure types + thin invoke wrappers;
 * all policy, the emission gate, and every sealed-token mint live in Rust
 * (ADR-0008 / Track 4). This module NEVER renders a raw pack: the only pack
 * shape it knows is `EmittedPackDto`, which Rust builds solely from an
 * `EmittedEvidencePack`.
 */

import { invoke } from '@tauri-apps/api/core';

export interface ProvenanceDto {
  source: string;
  quote: string | null;
}

export interface FindingDto {
  claim: string;
  confidence: number;
  provenance: ProvenanceDto[];
  validFrom: string;
  validUntil: string | null;
  isCurrent: boolean;
}

export interface LimitsDto {
  whatWouldChangeTheConclusion: string[];
  whatCouldNotBeChecked: string[];
  whereTheEvidenceRunsOut: string[];
}

export interface EmittedPackDto {
  /** Always true — the DTO exists only for a gate-passed pack. */
  emitted: boolean;
  question: string;
  findings: FindingDto[];
  /** Eliminated hypotheses arrive as `[eliminated] …` strings — render verbatim. */
  competingHypotheses: string[];
  keyAssumptions: string[];
  riskFlags: string[];
  recommendation: string | null;
  knowability: 'high_validity' | 'low_validity' | null;
  limitsOfThisFinding: LimitsDto | null;
  uncertaintyStatement: string | null;
}

export type EmitOutcome =
  | { outcome: 'emitted'; pack: EmittedPackDto }
  | { outcome: 'denied'; reason: string; class: string };

export interface ProvenanceInput {
  source: string;
  quote?: string;
}
export interface FindingInput {
  claim: string;
  confidence: number;
  provenance: ProvenanceInput[];
  validFrom: string;
}
export interface EmitCaseInput {
  question: string;
  scope?: string;
  findings: FindingInput[];
  knowability: 'high_validity' | 'low_validity';
  limits: Partial<LimitsDto>;
  uncertaintyStatement?: string;
  competingHypotheses?: string[];
  keyAssumptions?: string[];
  recommendation?: string;
}

/** operator brief → the crate emission gate → an emitted pack, or the honest denial. */
export function analyticalEmit(input: EmitCaseInput): Promise<EmitOutcome> {
  return invoke<EmitOutcome>('analytical_emit', { input });
}

export interface ToolInput {
  name: string;
  purpose: string;
}
export interface ApprovalPreviewDto {
  caseId: string;
  requestId: number;
  preview: string;
  tools: { name: string; purpose: string }[];
}
export interface ApprovalDecisionDto {
  grantsMinted: number;
  decision: string;
  log: { tool: string; decision: string; at: string }[];
}

/** Stage a previewable approval request — grants nothing (deny-by-default). */
export function analyticalPreviewApproval(
  caseId: string,
  tools: ToolInput[],
  requestedAt: string,
): Promise<ApprovalPreviewDto> {
  return invoke<ApprovalPreviewDto>('analytical_preview_approval', { caseId, tools, requestedAt });
}

/** Record the operator's deliberate decision — the ONLY mint of a tool grant. */
export function analyticalDecideApproval(
  caseId: string,
  tools: ToolInput[],
  approved: boolean,
  decidedAt: string,
): Promise<ApprovalDecisionDto> {
  return invoke<ApprovalDecisionDto>('analytical_decide_approval', {
    caseId,
    tools,
    approved,
    decidedAt,
  });
}

export interface ConsentDto {
  recorded: boolean;
  reference: string;
}
/** Mint an operator-attested consent record — only from an explicit reference. */
export function analyticalRecordConsent(reference: string): Promise<ConsentDto> {
  return invoke<ConsentDto>('analytical_record_consent', { reference });
}

export type SubjectScopeInput =
  | { kind: 'power_structure'; name: string; roleNote: string }
  | { kind: 'private_individual'; descriptor: string };
export interface TargetingDto {
  allowed: boolean;
  reason: string | null;
}
/** Assess an operator-declared subject scope — private individuals refused permanently. */
export function analyticalAssessTargeting(scope: SubjectScopeInput): Promise<TargetingDto> {
  return invoke<TargetingDto>('analytical_assess_targeting', { scope });
}

// --- pure render helpers (unit-testable; no truncation of the honesty) ---------

/** A knowability label reads verdict-first, plain — never loop vocabulary. */
export function knowabilityLabel(k: EmittedPackDto['knowability']): string {
  switch (k) {
    case 'high_validity':
      return 'Knowable — stable regularities, resolvable with evidence';
    case 'low_validity':
      return 'Low-knowability — noisy or novel; treat conclusions as provisional';
    default:
      return 'Knowability not assigned';
  }
}

/** True for a hypothesis the analysis eliminated (crate labels it `[eliminated] `). */
export function isEliminated(hypothesis: string): boolean {
  return hypothesis.startsWith('[eliminated] ');
}

/** The eliminated label, stripped of its marker for display alongside a badge. */
export function hypothesisText(hypothesis: string): string {
  return isEliminated(hypothesis) ? hypothesis.slice('[eliminated] '.length) : hypothesis;
}

/** The three-part limits statement, in canonical render order. Empty parts are
 *  dropped, but a part that carries content is never truncated. */
export function limitsSections(
  limits: LimitsDto | null,
): { label: string; items: string[] }[] {
  if (!limits) return [];
  return [
    { label: 'What would change the conclusion', items: limits.whatWouldChangeTheConclusion },
    { label: 'What could not be checked', items: limits.whatCouldNotBeChecked },
    { label: 'Where the evidence runs out', items: limits.whereTheEvidenceRunsOut },
  ].filter((s) => s.items.length > 0);
}
