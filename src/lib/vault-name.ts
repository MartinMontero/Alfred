// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Vault-name validation for the New Vault dialog (PASS 7). A vault name
 * becomes a real folder name on the user's disk, so the rules are the
 * strictest common denominator (Windows) stated in plain language — the
 * dialog shows the reason, never a silent trim.
 */
const ILLEGAL_CHARS = /[<>:"\/\\|?*\u0000-\u001f]/;
// Windows reserved device names (case-insensitive, with or without extension).
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export interface VaultNameVerdict {
  ok: boolean;
  /** Plain-language reason when not ok. */
  reason?: string;
  /** The trimmed name to actually use when ok. */
  name?: string;
}

export function validateVaultName(raw: string): VaultNameVerdict {
  const name = raw.trim();
  if (!name) return { ok: false, reason: 'Give the vault a name.' };
  if (name.length > 80) return { ok: false, reason: 'Keep the name under 80 characters.' };
  if (ILLEGAL_CHARS.test(name))
    return { ok: false, reason: 'Folder names can’t contain < > : " / \\ | ? *' };
  if (name.endsWith('.') || name.endsWith(' '))
    return { ok: false, reason: 'The name can’t end with a dot or a space.' };
  if (RESERVED.test(name))
    return { ok: false, reason: `“${name}” is reserved by Windows — pick another name.` };
  return { ok: true, name };
}

/** Parent directory of a path, tolerant of / and \ separators. */
export function parentDir(path: string): string {
  const norm = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const idx = norm.lastIndexOf('/');
  return idx > 0 ? path.slice(0, idx) : path;
}

/** Join parent + name using the parent's own separator style. */
export function joinVaultPath(parent: string, name: string): string {
  const sep = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[/\\]+$/, '')}${sep}${name}`;
}

/**
 * Where a new vault lives: beside the current one. When the current vault
 * path has no resolvable parent (e.g. the web platform's bare root name),
 * the sibling is created at the same root — never nested inside the vault.
 */
export function siblingVaultPath(currentVault: string, name: string): string {
  const parent = parentDir(currentVault);
  if (parent === currentVault) return name;
  return joinVaultPath(parent, name);
}
