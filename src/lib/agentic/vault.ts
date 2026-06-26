// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Agentic vault — platform wiring (Phase 2).
 *
 * The only @platform-touching layer of the agentic vault. It composes the pure,
 * unit-tested modules (topology / hot / librarian / spec-kit) with the vault
 * filesystem: a one-click scaffold, a hot.md generate/refresh (command + a
 * session-end hook), the Librarian audit (read-only), and the Spec Kit feature
 * generator. Writes are non-clobbering — existing files are never overwritten.
 */

import { platform } from '@platform';
import type { FileEntry } from '../../platform/types';
import { buildScaffoldPlan, type ScaffoldEntry, type ScaffoldOptions } from './topology';
import { generateHotMd, parseHotMd, emptyHotState, type HotState } from './hot';
import { auditVault, type Proposal, type VaultNote } from './librarian';
import { buildSpecKitFeature, type SpecKitOptions } from './spec-kit';

function full(vaultPath: string, rel: string): string {
  return `${vaultPath}/${rel}`;
}

/** Write a plan (folders first, then files) without clobbering existing files. */
async function writePlan(vaultPath: string, plan: ScaffoldEntry[]): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const entry of plan.filter((e) => e.kind === 'folder')) {
    await platform.vault.createFolder(full(vaultPath, entry.path), vaultPath);
  }
  for (const entry of plan.filter((e) => e.kind === 'file')) {
    const path = full(vaultPath, entry.path);
    if (await platform.vault.exists(path)) {
      skipped.push(entry.path);
      continue;
    }
    await platform.vault.createFile(path, vaultPath);
    await platform.vault.write(path, entry.content ?? '', vaultPath);
    created.push(entry.path);
  }
  return { created, skipped };
}

/** One-click: scaffold the full agentic-project topology into a vault. */
export async function scaffoldAgenticVault(
  vaultPath: string,
  opts: ScaffoldOptions = {},
): Promise<{ created: string[]; skipped: string[] }> {
  return writePlan(vaultPath, buildScaffoldPlan(opts));
}

const HOT_REL = 'hot.md';

/**
 * Generate or refresh hot.md. On refresh, the existing file is parsed and
 * re-emitted with today's date so it stays well-formed and current — the
 * inverse generate/parse pair guarantees no structure is lost.
 */
export async function refreshHotMd(
  vaultPath: string,
  opts: { today?: string; createIfMissing?: boolean } = {},
): Promise<HotState | null> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const createIfMissing = opts.createIfMissing ?? true;
  const path = full(vaultPath, HOT_REL);
  const exists = await platform.vault.exists(path);
  // The session-end hook passes createIfMissing:false so it never seeds hot.md
  // into a vault that was never scaffolded as an agentic project.
  if (!exists && !createIfMissing) return null;

  let state: HotState;
  if (exists) {
    state = parseHotMd(await platform.vault.read(path, vaultPath));
  } else {
    state = emptyHotState('Vault', today);
    await platform.vault.createFile(path, vaultPath);
  }
  state.updated = today;
  await platform.vault.write(path, generateHotMd(state), vaultPath);
  return state;
}

/** Flatten the vault file tree into a list of markdown file paths. */
function collectMarkdown(entries: FileEntry[], acc: string[] = []): string[] {
  for (const e of entries) {
    if (e.isDirectory) {
      if (e.children) collectMarkdown(e.children, acc);
    } else if (e.path.toLowerCase().endsWith('.md')) {
      acc.push(e.path);
    }
  }
  return acc;
}

/**
 * Run the Proposal-First Librarian over the vault. READ-ONLY: it reads notes and
 * returns proposals; it never writes. Applying a proposal is a separate,
 * explicitly-approved action (librarian.applyApprovedProposal).
 */
export async function runLibrarianAudit(vaultPath: string): Promise<Proposal[]> {
  const tree = await platform.vault.list(vaultPath);
  const mdPaths = collectMarkdown(tree);
  const notes: VaultNote[] = [];
  for (const path of mdPaths) {
    try {
      const content = await platform.vault.read(path, vaultPath);
      // Store a vault-relative path so wikilink resolution lines up with the scaffold.
      const rel = path.startsWith(vaultPath) ? path.slice(vaultPath.length).replace(/^[/\\]+/, '') : path;
      notes.push({ path: rel.replace(/\\/g, '/'), content });
    } catch {
      // Unreadable file — skip; the audit is best-effort and non-destructive.
    }
  }
  return auditVault(notes);
}

/** Scaffold a Spec Kit feature folder (spec/plan/tasks) under specs/. */
export async function createSpecKitFeature(
  vaultPath: string,
  feature: string,
  opts: SpecKitOptions = {},
): Promise<{ created: string[]; skipped: string[] }> {
  return writePlan(vaultPath, buildSpecKitFeature(feature, opts));
}
