// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, expect, it } from 'vitest';
import { vaultLineLabel, vaultLineText } from './vault-line';

describe('vaultLineText', () => {
  it('reads "no vault open yet" when no vault is open', () => {
    expect(vaultLineText(null)).toBe('no vault open yet');
    expect(vaultLineText(undefined)).toBe('no vault open yet');
    expect(vaultLineText('')).toBe('no vault open yet');
  });

  it('names the vault from a Windows path', () => {
    expect(vaultLineText('C:\\Users\\m\\vaults\\Holmes')).toBe('Holmes · on this machine');
  });

  it('names the vault from a POSIX path', () => {
    expect(vaultLineText('/home/m/Casebook')).toBe('Casebook · on this machine');
  });
});

describe('vaultLineLabel — WCAG 2.5.3 label-in-name contract', () => {
  // The accessible name must CONTAIN the visible text, or voice-control
  // users cannot activate the button by saying what they see. This is the
  // exact Lighthouse label-content-name-mismatch finding from the a11y
  // round; it fails against the old fixed "Vault options" label.
  it('contains the visible text when a vault is open', () => {
    const path = 'C:\\Users\\m\\vaults\\Holmes';
    expect(vaultLineLabel(path)).toContain(vaultLineText(path));
  });

  it('contains the visible text when no vault is open', () => {
    expect(vaultLineLabel(null)).toContain(vaultLineText(null));
  });

  it('still says what activating it does', () => {
    expect(vaultLineLabel(null).toLowerCase()).toContain('vault options');
  });
});
