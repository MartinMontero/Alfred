// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { beforeEach, describe, expect, it } from 'vitest';
import { DISPLAY_NAME_KEY, getDisplayName, greeting, greetingForHour, setDisplayName } from './display-name';

// Node test environment has no DOM — a minimal Storage shim keeps this a pure
// unit test (the lib itself guards with try/catch for exotic contexts).
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

beforeEach(() => store.clear());

describe('greetingForHour', () => {
  it('maps the day honestly', () => {
    expect(greetingForHour(3)).toBe('Up late');
    expect(greetingForHour(8)).toBe('Good morning');
    expect(greetingForHour(13)).toBe('Good afternoon');
    expect(greetingForHour(21)).toBe('Good evening');
  });
});

describe('display name', () => {
  it('greets by the chosen name, and gracefully without one', () => {
    expect(greeting(new Date('2026-07-19T20:00:00'))).toBe('Good evening.');
    setDisplayName('  Martin ');
    expect(getDisplayName()).toBe('Martin');
    expect(greeting(new Date('2026-07-19T08:00:00'))).toBe('Good morning, Martin.');
  });

  it('clearing the name removes the stored key entirely', () => {
    setDisplayName('Martin');
    setDisplayName('   ');
    expect(localStorage.getItem(DISPLAY_NAME_KEY)).toBeNull();
  });
});
