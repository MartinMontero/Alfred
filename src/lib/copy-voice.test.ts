// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Copy-drift gate — beta.4 FIX 1/4 (same style as the zero-Soapbox grep).
 *
 * User-facing copy never carries the internal spec vocabulary
 * (sovereign / local-first / Nostr-native / PKM — canon lives in docs, not
 * dialogs) and never reaches for the industry shorthand "AI" /
 * "Artificial Intelligence" — Alfred's copy says what the tool does.
 *
 * Scope: UI copy surfaces only. Code identifiers, import paths, comments,
 * and CSS class tokens are excluded line-wise below; docs/ is out of scope
 * by design (specs may use spec words).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SURFACES = [
  'README.md',
  '.github/workflows/release.yml',
  'src/App.tsx',
  'src/components/Settings.tsx',
  'src/components/Onboarding.tsx',
  'src/components/Home.tsx',
  'src/components/Sidebar.tsx',
  'src/components/GoosePanel.tsx',
  'src/components/FileInfoDialog.tsx',
  'src/components/CustomProviderChat.tsx',
];

const JARGON = /sovereign|local-first|nostr-native|\bPKM\b/i;
const MARKETING = /\bAI\b|Artificial Intelligence/; // case-sensitive: OPENAI etc. don't match

/** Lines that are not user-facing copy. */
const isExcluded = (line: string): boolean => {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')) return true;
  if (t.startsWith('import ') || t.startsWith('#')) return true; // imports; yaml/md comments-headers
  // CSS class tokens / identifiers, not prose (e.g. status-item--sovereign).
  if (/class(Name|List)?=/.test(t) && !/>[^<]*(sovereign|local-first|PKM|\bAI\b)/i.test(t)) return true;
  return false;
};

function violations(file: string, pattern: RegExp): string[] {
  const text = readFileSync(resolve(__dirname, '../..', file), 'utf-8');
  const out: string[] = [];
  text.split('\n').forEach((line, i) => {
    if (pattern.test(line) && !isExcluded(line)) out.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`);
  });
  return out;
}

describe('copy voice — no internal jargon, no marketing shorthand, in any user-facing string', () => {
  it('sanity: the gate catches the pre-beta.4 About copy (red-first)', () => {
    expect(JARGON.test('A sovereign, local-first, Nostr-native PKM')).toBe(true);
    expect(MARKETING.test('builders who direct AI to build software')).toBe(true);
    expect(MARKETING.test('OPENAI_API_KEY openai')).toBe(false); // identifiers stay legal
  });

  for (const file of SURFACES) {
    it(`${file}: zero sovereign/local-first/Nostr-native/PKM`, () => {
      expect(violations(file, JARGON)).toEqual([]);
    });
    it(`${file}: zero bare AI / Artificial Intelligence`, () => {
      expect(violations(file, MARKETING)).toEqual([]);
    });
  }
});
