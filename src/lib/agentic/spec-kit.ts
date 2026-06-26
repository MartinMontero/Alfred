// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Spec Kit flow (Phase 2 — agentic vault).
 *
 * Wires the spec-driven sequence (constitution -> specify -> plan -> tasks ->
 * implement) into specs/. Artifacts land in `specs/<feature>/` and every spec
 * inherits [[brain/constitution]] — which carries the platform exclusion policy
 * (see topology.ts) — so any project scaffolded inside the vault is born
 * compliant. Pure / testable; the wiring writes the returned entries.
 */

import { buildFrontmatter } from './frontmatter-schema';
import type { ScaffoldEntry } from './topology';

export const SPECKIT_STEPS = ['constitution', 'specify', 'plan', 'tasks', 'implement'] as const;
export type SpecKitStep = (typeof SPECKIT_STEPS)[number];

/** The slash command for each step (mirrors github/spec-kit's /speckit.*). */
export const SPECKIT_COMMANDS: Record<SpecKitStep, string> = {
  constitution: '/speckit.constitution',
  specify: '/speckit.specify',
  plan: '/speckit.plan',
  tasks: '/speckit.tasks',
  implement: '/speckit.implement',
};

export interface SpecKitOptions {
  now?: number;
}

function iso(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** kebab-case a feature title into a folder-safe slug. */
export function featureSlug(feature: string): string {
  return feature
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'feature';
}

function artifact(
  path: string,
  description: string,
  tags: string[],
  updated: string,
  body: string,
): ScaffoldEntry {
  const fm = buildFrontmatter({
    id: path.replace(/\.md$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    description: description.slice(0, 150),
    tags,
    domain: 'specs',
    updated,
  });
  return { kind: 'file', path, content: `${fm}\n\n${body.trim()}\n` };
}

/**
 * Build the spec/plan/tasks artifacts for a feature (the `specify`/`plan`/`tasks`
 * steps). `constitution` is the shared [[brain/constitution]]; `implement`
 * produces code, tracked in [[memory-bank/progress]].
 */
export function buildSpecKitFeature(feature: string, opts: SpecKitOptions = {}): ScaffoldEntry[] {
  const updated = iso(opts.now ?? Date.now());
  const slug = featureSlug(feature);
  const dir = `specs/${slug}`;
  const title = feature.trim() || 'Feature';

  return [
    { kind: 'folder', path: dir },

    artifact(`${dir}/spec.md`, `Spec for "${title}": problem, scope, acceptance criteria. Inherits the constitution.`, ['spec-kit', 'specify'], updated, [
      `# Spec — ${title}`,
      '',
      'Inherits [[brain/constitution]] (exclusion policy + principles).',
      '',
      '## Problem',
      'What are we solving, and for whom?',
      '',
      '## Scope',
      '- In scope:',
      '- Out of scope:',
      '',
      '## Acceptance criteria',
      '- [ ] ...',
      '',
      '## Constraints',
      '- No Meta / OpenAI / xAI deps; React forbidden; zero Soapbox (inherited).',
    ].join('\n')),

    artifact(`${dir}/plan.md`, `Technical plan for "${title}": architecture, stack, and the approach to satisfy the spec.`, ['spec-kit', 'plan'], updated, [
      `# Plan — ${title}`,
      '',
      'Derived from [[' + `${dir}/spec` + ']].',
      '',
      '## Approach',
      'How the spec is satisfied, at an architectural level.',
      '',
      '## Stack & dependencies',
      '- Screen every new dependency through the inherited exclusion policy.',
      '',
      '## Risks',
      '- ...',
    ].join('\n')),

    artifact(`${dir}/tasks.md`, `Task breakdown for "${title}": ordered, checkable units derived from the plan.`, ['spec-kit', 'tasks'], updated, [
      `# Tasks — ${title}`,
      '',
      'Derived from [[' + `${dir}/plan` + ']]. Implement in order; track in [[memory-bank/progress]].',
      '',
      '- [ ] T1 — ...',
      '- [ ] T2 — ...',
    ].join('\n')),
  ];
}

/** The artifact paths a feature is expected to produce (for verification). */
export function specKitFeaturePaths(feature: string, opts: SpecKitOptions = {}): string[] {
  return buildSpecKitFeature(feature, opts).map((e) => e.path);
}
