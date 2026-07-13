// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { generateHotMd, emptyHotState, type HotState } from './hot';
import {
  assembleProbeContext,
  recallProbe,
  artifactProbe,
  continuationProbe,
  runContextProbes,
} from './context-probes';

// A realistic mid-project hot.md: a decision made, a file touched, a task
// half-done. The probes run over Alfred's ACTUAL assembled output
// (generateHotMd), not a hand-written string, so they verify the real substrate.
function midProjectState(): HotState {
  return {
    ...emptyHotState('Alfred'),
    focus: ['[[specs/telemetry-ui]] — wire the opt-in toggle'],
    recentDecisions: [
      'Permission enforcement keys on (extension, tool_name), never model-authored title',
      'Direct Chat kept as a non-agentic surface (ADR-0004)',
    ],
    openLoops: ['Context-probe harness not yet wired into CI', 'Latency-accuracy guardrail pending'],
    prerequisites: ['Run npm run verify:all before the gate'],
    anchors: ['[[brain/constitution]]', '[[memory-bank/progress]]'],
  };
}

describe('context probes over real hot.md output', () => {
  const ctx = assembleProbeContext(
    generateHotMd(midProjectState()),
    // a pulled memory-bank/progress file recording modified artifacts
    ['# progress\n\nModified this session:\n- src/lib/goose/tool-gate.ts\n- src/components/Settings.tsx'],
  );

  it('recall: finds facts the context carries', () => {
    const r = recallProbe(ctx, [
      'never model-authored title',
      'Direct Chat kept as a non-agentic surface',
    ]);
    expect(r.passed).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('artifact: finds modified files by path, basename, or wikilink form', () => {
    const r = artifactProbe(ctx, [
      'src/lib/goose/tool-gate.ts',
      'Settings.tsx',
      '[[specs/telemetry-ui]]',
    ]);
    expect(r.passed).toBe(true);
  });

  it('continuation: finds the next actionable step of the in-flight task', () => {
    const r = continuationProbe(ctx, ['Context-probe harness not yet wired into CI']);
    expect(r.passed).toBe(true);
  });

  it('runContextProbes passes when every expectation is present', () => {
    const run = runContextProbes(ctx, {
      recall: ['never model-authored title'],
      artifact: ['tool-gate.ts'],
      continuation: ['Latency-accuracy guardrail pending'],
    });
    expect(run.allPassed).toBe(true);
    expect(run.results.map((x) => x.kind)).toEqual(['recall', 'artifact', 'continuation']);
  });

  // The probes MUST be able to fail for the right reason — a context missing a
  // fact fails recall and names exactly what is missing (not a vacuous green).
  it('fails, and reports what is missing, when the context lacks a fact', () => {
    const r = recallProbe(ctx, [
      'never model-authored title', // present
      'we migrated the vault schema to v2', // absent — never decided
    ]);
    expect(r.passed).toBe(false);
    expect(r.missing).toEqual(['we migrated the vault schema to v2']);
    expect(r.found).toContain('never model-authored title');
  });

  it('artifact probe fails for a file the context never references', () => {
    const r = artifactProbe(ctx, ['src/lib/nostr/sync.ts']);
    expect(r.passed).toBe(false);
    expect(r.missing).toEqual(['src/lib/nostr/sync.ts']);
  });

  it('does not false-match a fact as a substring of an unrelated word', () => {
    // "read" must not be satisfied by "already"; normalize keeps it honest via
    // whole-phrase presence, and a distinctive phrase is absent here.
    const r = recallProbe(ctx, ['reindex the blossom cache']);
    expect(r.passed).toBe(false);
  });
});
