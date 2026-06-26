// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Agentic vault scaffold (Phase 2 — the differentiator).
 *
 * Operationalizes the deterministic vault topology from
 * docs/research/agentic-pkm-architecture.md (ASB directory ontology + Hermes
 * tiered memory + Spec Kit): a one-click "Agentic Project" structure an agent
 * can navigate without guessing where anything lives.
 *
 * Pure: `buildScaffoldPlan` returns a list of folders + seed files as data; the
 * platform wiring (src/lib/agentic/vault.ts) writes them. No @platform/DOM dep,
 * so the topology is unit-testable.
 */

import { buildFrontmatter } from './frontmatter-schema';
import { emptyHotState, generateHotMd } from './hot';

export const AGENTIC_VAULT_VERSION = 1;

export interface ScaffoldEntry {
  kind: 'folder' | 'file';
  /** Vault-relative POSIX path. */
  path: string;
  /** File contents (only for kind === 'file'). */
  content?: string;
}

export interface ScaffoldOptions {
  project?: string;
  /** Clock injection for deterministic ids/dates in tests. */
  now?: number;
}

/** The canonical folder set (deterministic; the agent relies on these names). */
export const TOPOLOGY_FOLDERS = [
  'brain',
  'specs',
  'memory-bank',
  'memory-bank/decisions',
  'domains',
  'inbox',
  'daily',
  'thinking',
] as const;

function iso(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** id derived from the path — deterministic, descriptive, rename-stable enough for seeds. */
function idForPath(path: string): string {
  return path.replace(/\.md$/i, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
}

function note(
  path: string,
  meta: { description: string; tags: string[]; domain: string; updated: string },
  body: string,
): ScaffoldEntry {
  const fm = buildFrontmatter({
    id: idForPath(path),
    description: meta.description.slice(0, 150),
    tags: meta.tags,
    domain: meta.domain,
    updated: meta.updated,
  });
  return { kind: 'file', path, content: `${fm}\n\n${body.trim()}\n` };
}

/**
 * The vault constitution — inherits Alfred's platform exclusion policy so any
 * project scaffolded *inside* an agentic vault is born compliant. Mirrors the
 * CLAUDE.md constraints; kept terse on purpose.
 */
function constitutionBody(): string {
  return [
    '# Constitution',
    '',
    'Immutable principles for this project. Every spec, plan, and task inherits these.',
    '',
    '## Inherited exclusion policy (non-negotiable)',
    '',
    '- **Vendor exclusion (absolute):** no dependency, import, endpoint, or config —',
    '  direct or transitive — for **Meta, OpenAI, or xAI**. Google is permitted.',
    '- **React is forbidden** (Meta-owned), including transitively.',
    '- **Zero Soapbox:** no `@nostrify/nostrify`, no `@soapbox.pub/*` / `@soapbox/*`,',
    '  nothing with soapbox-pub / Alex Gleason / MK Fain provenance.',
    '- **Permitted AI providers:** Anthropic + Google + local (Ollama). Excluded',
    '  providers must be verified unreachable.',
    '- **License:** ship AGPL-3.0-or-later; keep upstream notices.',
    '',
    'See [[brain/RULES]] for working rules and [[brain/NORTH_STAR]] for intent.',
    '',
    '## Working principles',
    '',
    '- Specs are ground truth; the codebase is the compiled output of the specs.',
    '- Sovereignty, security/privacy, builder agency, and openness — in that order —',
    '  break ties.',
    '- The AI Librarian proposes; it never writes without explicit approval.',
  ].join('\n');
}

/** Build the full scaffold plan (folders first, then seed files). */
export function buildScaffoldPlan(opts: ScaffoldOptions = {}): ScaffoldEntry[] {
  const project = opts.project?.trim() || 'New Agentic Project';
  const now = opts.now ?? Date.now();
  const updated = iso(now);

  const folders: ScaffoldEntry[] = TOPOLOGY_FOLDERS.map((path) => ({ kind: 'folder', path }));

  const files: ScaffoldEntry[] = [
    note('brain/NORTH_STAR.md', {
      description: `North star for ${project}: the single, stable statement of what success looks like and why.`,
      tags: ['brain', 'north-star'],
      domain: 'brain',
      updated,
    }, [
      '# North Star',
      '',
      `**Project:** ${project}`,
      '',
      'One paragraph: the durable outcome this project exists to produce, and for whom.',
      'Keep this stable — everything else flexes around it. Link the live state in [[hot]].',
    ].join('\n')),

    note('brain/RULES.md', {
      description: 'Hard working rules for agents in this vault: scope discipline, proposal-first edits, house style.',
      tags: ['brain', 'rules'],
      domain: 'brain',
      updated,
    }, [
      '# Rules',
      '',
      '- Do only the task in scope; new deps / schema changes need sign-off.',
      '- The Librarian is **Proposal-First**: it never writes without explicit approval.',
      '- Plain professional prose; no emojis in code or UI unless requested.',
      '- Store **decisions, preferences, and failed approaches** in memory — not chatter.',
      '- Inherits [[brain/constitution]].',
    ].join('\n')),

    note('brain/constitution.md', {
      description: 'Project constitution — inherits the platform exclusion policy so scaffolded work is born compliant.',
      tags: ['brain', 'constitution', 'spec-kit'],
      domain: 'brain',
      updated,
    }, constitutionBody()),

    note('specs/README.md', {
      description: 'Spec Kit flow: constitution -> specify -> plan -> tasks -> implement. Specs are this project’s ground truth.',
      tags: ['specs', 'spec-kit'],
      domain: 'specs',
      updated,
    }, [
      '# Specs',
      '',
      'Spec-driven development artifacts live here, one folder per feature:',
      '',
      '1. `/speckit.constitution` → [[brain/constitution]] (immutable principles)',
      '2. `/speckit.specify` → `specs/<feature>/spec.md`',
      '3. `/speckit.plan` → `specs/<feature>/plan.md`',
      '4. `/speckit.tasks` → `specs/<feature>/tasks.md`',
      '5. `/speckit.implement` → working code, tracked in [[memory-bank/progress]]',
    ].join('\n')),

    note('memory-bank/projectbrief.md', {
      description: 'Tier-2 living file: foundational goals and high-level requirements. The why and the what.',
      tags: ['memory-bank'],
      domain: 'memory-bank',
      updated,
    }, '# Project Brief\n\nFoundational goals and high-level requirements. Stable; updated deliberately.'),

    note('memory-bank/techContext.md', {
      description: 'Tier-2 living file: the technology stack, pinned dependencies, and local dev environment.',
      tags: ['memory-bank', 'tech'],
      domain: 'memory-bank',
      updated,
    }, '# Tech Context\n\nStack, pinned versions, environment setup, and known gotchas.'),

    note('memory-bank/activeContext.md', {
      description: 'Tier-2 living file: the current sprint focus, open technical challenges, and immediate next steps.',
      tags: ['memory-bank', 'active'],
      domain: 'memory-bank',
      updated,
    }, '# Active Context\n\nCurrent focus, open challenges, next steps. Refreshed often; mirrored into [[hot]].'),

    note('memory-bank/progress.md', {
      description: 'Tier-2 living file: what works, what is left, and the rationale behind shipped decisions.',
      tags: ['memory-bank', 'progress'],
      domain: 'memory-bank',
      updated,
    }, '# Progress\n\nWhat works, what remains, and links to the [[memory-bank/decisions]] behind them.'),

    note('memory-bank/decisions/0000-template.md', {
      description: 'ADR template: context, decision, consequences. Copy to NNNN-<slug>.md for each durable decision.',
      tags: ['memory-bank', 'decision', 'adr', 'template'],
      domain: 'memory-bank',
      updated,
    }, [
      '# NNNN — <decision title>',
      '',
      '**Status:** proposed | accepted | superseded',
      '',
      '## Context',
      'What forces are at play?',
      '',
      '## Decision',
      'What we chose, in one or two sentences.',
      '',
      '## Consequences',
      'Trade-offs accepted, and any failed approaches ruled out.',
    ].join('\n')),

    note('domains/README.md', {
      description: 'Siloed domain workspaces (e.g. engineering, atproto). Boundaries keep agent search scoped.',
      tags: ['domains'],
      domain: 'domains',
      updated,
    }, '# Domains\n\nHigh-level, siloed scopes. One subfolder per domain; cross-links are explicit [[wikilinks]].'),

    note('inbox/README.md', {
      description: 'Friction-free capture for raw, unprocessed notes awaiting triage into a domain.',
      tags: ['inbox', 'capture'],
      domain: 'inbox',
      updated,
    }, '# Inbox\n\nDrop raw captures here. Triage them into [[domains/README]] or [[memory-bank/activeContext]].'),

    note('daily/README.md', {
      description: 'Tier-3 permanent chronological tier: one timestamped note per day of operational events.',
      tags: ['daily', 'episodic'],
      domain: 'daily',
      updated,
    }, '# Daily\n\nPermanent, append-only episodic log. One `YYYY-MM-DD.md` per day; never rewritten.'),

    note('thinking/README.md', {
      description: 'Agent scratchpads, session transcripts, and reasoning logs — a transparent record, not ground truth.',
      tags: ['thinking', 'logs'],
      domain: 'thinking',
      updated,
    }, '# Thinking\n\nSession logs and scratchpads. Transparent reasoning trail; promote stable facts into memory-bank.'),
  ];

  const hot: ScaffoldEntry = {
    kind: 'file',
    path: 'hot.md',
    content: generateHotMd({
      ...emptyHotState(project, updated),
      focus: ['Define the [[brain/NORTH_STAR]]', 'Draft the first spec in [[specs/README]]'],
      openLoops: ['No specs written yet'],
      prerequisites: ['Read [[brain/constitution]]'],
    }),
  };

  return [...folders, hot, ...files];
}

/** The paths the scaffold is expected to create — used to verify a round-trip. */
export function scaffoldPaths(opts: ScaffoldOptions = {}): string[] {
  return buildScaffoldPlan(opts).map((e) => e.path);
}
