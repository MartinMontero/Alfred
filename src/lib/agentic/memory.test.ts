// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  classifyMemory,
  shouldPromote,
  promote,
  isStableFact,
  PROMOTION_THRESHOLD,
  MEMORY_TARGETS,
  type MemoryEntry,
} from './memory';

describe('memory classification', () => {
  it('recognises decisions', () => {
    expect(classifyMemory('We decided to adopt nostr-tools over NDK.')).toBe('decision');
  });
  it('recognises preferences', () => {
    expect(classifyMemory('Always use cross-env in npm scripts by default.')).toBe('preference');
  });
  it('recognises failed approaches', () => {
    expect(classifyMemory('Tried the keyring on Windows but it failed; avoid it.')).toBe('failed-approach');
  });
  it('treats incidental remarks as chatter', () => {
    expect(classifyMemory('ok thanks, looks good')).toBe('chatter');
  });
});

describe('promotion threshold', () => {
  it('does not promote a small buffer', () => {
    expect(shouldPromote([{ text: 'short' }])).toBe(false);
  });
  it('promotes once the buffer crosses ~67% capacity', () => {
    const big: MemoryEntry[] = [{ text: 'x'.repeat(PROMOTION_THRESHOLD) }];
    expect(shouldPromote(big)).toBe(true);
  });
});

describe('promotion routes stable facts and discards chatter', () => {
  const buffer: MemoryEntry[] = [
    { text: 'We decided to ship AGPL-3.0-or-later.' },
    { text: 'Prefer plain prose, never emojis in UI.' },
    { text: 'The portable-pty path failed on Windows; avoid it.' },
    { text: 'haha nice' },
  ];
  const result = promote(buffer);

  it('promotes only the three stable facts', () => {
    expect(result.promotedCount).toBe(3);
    expect(result.discarded).toHaveLength(1);
  });

  it('routes each kind to its memory-bank target', () => {
    const byKind = Object.fromEntries(result.promoted.map((p) => [p.kind, p.target]));
    expect(byKind.decision).toBe(MEMORY_TARGETS.decision);
    expect(byKind.preference).toBe(MEMORY_TARGETS.preference);
    expect(byKind['failed-approach']).toBe(MEMORY_TARGETS['failed-approach']);
  });

  it('never promotes chatter into durable memory', () => {
    expect(result.promoted.some((p) => isStableFact(p.entry) === false)).toBe(false);
    expect(result.discarded[0].text).toBe('haha nice');
  });
});
