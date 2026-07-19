// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, expect, it } from 'vitest';
import { joinVaultPath, parentDir, siblingVaultPath, validateVaultName } from './vault-name';

describe('validateVaultName', () => {
  it('accepts a plain name and returns it trimmed', () => {
    expect(validateVaultName('  Casebook ')).toEqual({ ok: true, name: 'Casebook' });
  });
  it('rejects empty and whitespace-only', () => {
    expect(validateVaultName('').ok).toBe(false);
    expect(validateVaultName('   ').ok).toBe(false);
  });
  it('rejects Windows-illegal characters with a plain reason', () => {
    for (const bad of ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a|b']) {
      const v = validateVaultName(bad);
      expect(v.ok).toBe(false);
      expect(v.reason).toBeTruthy();
    }
  });
  it('allows spaces and hyphens inside names — "My Vault" is a normal folder', () => {
    expect(validateVaultName('My Vault')).toEqual({ ok: true, name: 'My Vault' });
    expect(validateVaultName('case-book').ok).toBe(true);
  });
  it('rejects reserved device names and trailing dot/space', () => {
    expect(validateVaultName('CON').ok).toBe(false);
    expect(validateVaultName('lpt3').ok).toBe(false);
    expect(validateVaultName('notes.').ok).toBe(false);
  });
});

describe('path helpers', () => {
  it('parentDir handles both separator styles', () => {
    expect(parentDir('C:\\Users\\User\\Holmes')).toBe('C:\\Users\\User');
    expect(parentDir('/home/user/holmes')).toBe('/home/user');
  });
  it('joinVaultPath keeps the parent separator style', () => {
    expect(joinVaultPath('C:\\Users\\User', 'Casebook')).toBe('C:\\Users\\User\\Casebook');
    expect(joinVaultPath('/home/user', 'Casebook')).toBe('/home/user/Casebook');
  });
});

describe('siblingVaultPath', () => {
  it('creates beside the current vault on desktop paths', () => {
    expect(siblingVaultPath('C:\\Users\\User\\Holmes', 'Casebook')).toBe('C:\\Users\\User\\Casebook');
  });
  it('never nests inside a parentless (web root) vault — the probe-caught bug', () => {
    expect(siblingVaultPath('alfred-vault', 'Casebook')).toBe('Casebook');
  });
});
