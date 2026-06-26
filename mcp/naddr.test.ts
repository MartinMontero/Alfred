// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { encodeNaddr, decodeNaddr, isNaddr, resolveIdentifierToPath, KIND_FILE } from './naddr';

// A valid 32-byte hex pubkey (deterministic, not a real key).
const PUBKEY = 'a'.repeat(64);

describe('naddr addressing', () => {
  it('encode -> decode round-trips identifier and kind', () => {
    const naddr = encodeNaddr('brain-rules', PUBKEY);
    expect(isNaddr(naddr)).toBe(true);
    const d = decodeNaddr(naddr);
    expect(d.identifier).toBe('brain-rules');
    expect(d.kind).toBe(KIND_FILE);
    expect(d.pubkey).toBe(PUBKEY);
  });

  it('isNaddr rejects non-naddr strings', () => {
    expect(isNaddr('brain/RULES.md')).toBe(false);
    expect(isNaddr('npub1xxx')).toBe(false);
  });

  it('decodeNaddr rejects a non-naddr', () => {
    expect(() => decodeNaddr('not-an-naddr')).toThrow();
  });

  it('resolves an identifier to a note by frontmatter id, then by path', () => {
    const notes = [
      { path: 'brain/RULES.md', id: 'brain-rules' },
      { path: 'hot.md', id: 'hot' },
    ];
    expect(resolveIdentifierToPath('brain-rules', notes)).toBe('brain/RULES.md');
    expect(resolveIdentifierToPath('hot.md', notes)).toBe('hot.md');
    expect(resolveIdentifierToPath('missing', notes)).toBeNull();
  });
});
