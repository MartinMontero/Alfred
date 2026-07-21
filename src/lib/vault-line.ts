// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * The nav's vault line — the one string that names the open vault in the
 * study sidebar. Kept as a pure helper so the WCAG 2.5.3 contract is
 * testable: the button's accessible name must CONTAIN its visible text
 * (label-content-name-mismatch, PASS 9 a11y round), so voice-control users
 * can say what they see.
 */

/** Visible text of the vault-line button. */
export function vaultLineText(vaultPath: string | null | undefined): string {
  if (!vaultPath) return 'no vault open yet';
  const name = vaultPath.replace(/\\/g, '/').split('/').pop() || vaultPath;
  return `${name} · on this machine`;
}

/**
 * Accessible name for the vault-line button: the visible text first (2.5.3),
 * then what activating it does.
 */
export function vaultLineLabel(vaultPath: string | null | undefined): string {
  return `${vaultLineText(vaultPath)} — vault options`;
}
