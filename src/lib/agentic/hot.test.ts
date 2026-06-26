// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  generateHotMd,
  parseHotMd,
  emptyHotState,
  estimateTokens,
  isWithinBudget,
  HOT_TOKENS_MAX,
  type HotState,
} from './hot';
import { validateNoteContent } from './frontmatter-schema';

const sample: HotState = {
  project: 'Alfred',
  updated: '2026-06-25',
  focus: ['Ship the [[specs/vault-scaffold/spec]]', 'Refine [[hot]] generation'],
  recentDecisions: ['Adopted nostr-tools — see [[memory-bank/decisions/0001-nostrify]]'],
  openLoops: ['Wire the session-end hook'],
  prerequisites: ['Read [[brain/constitution]]'],
  anchors: ['[[brain/NORTH_STAR]]', '[[memory-bank/activeContext]]'],
};

describe('hot.md generation', () => {
  it('produces a note with valid load-bearing frontmatter', () => {
    expect(validateNoteContent(generateHotMd(sample)).valid).toBe(true);
  });

  it('is written almost entirely as wikilinks (progressive disclosure)', () => {
    const md = generateHotMd(sample);
    expect(md).toContain('[[specs/vault-scaffold/spec]]');
    expect(md).toContain('[[brain/constitution]]');
  });

  it('sits within the startup token budget', () => {
    const md = generateHotMd(sample);
    expect(estimateTokens(md)).toBeLessThanOrEqual(HOT_TOKENS_MAX);
    expect(isWithinBudget(md)).toBe(true);
  });
});

describe('hot.md round-trip (generate <-> parse are inverse)', () => {
  it('preserves every section and the project name', () => {
    const round = parseHotMd(generateHotMd(sample));
    expect(round.project).toBe(sample.project);
    expect(round.focus).toEqual(sample.focus);
    expect(round.recentDecisions).toEqual(sample.recentDecisions);
    expect(round.openLoops).toEqual(sample.openLoops);
    expect(round.prerequisites).toEqual(sample.prerequisites);
    expect(round.anchors).toEqual(sample.anchors);
  });

  it('refreshes idempotently (generate -> parse -> generate is stable)', () => {
    const once = generateHotMd(sample);
    const twice = generateHotMd(parseHotMd(once));
    expect(twice).toBe(once);
  });

  it('round-trips an empty state without inventing items', () => {
    const empty = emptyHotState('Empty', '2026-06-25');
    const round = parseHotMd(generateHotMd(empty));
    expect(round.focus).toEqual([]);
    expect(round.openLoops).toEqual([]);
    expect(round.anchors).toEqual(empty.anchors);
  });
});
