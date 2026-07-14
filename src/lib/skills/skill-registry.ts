// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Active-skill registry + rug-pull defense (Stage C, Lock 3 — ADR-0003).
 *
 * A skill that was clean at install can be edited on disk afterward — the
 * "rug-pull": approve benign, swap malicious. Lock 3 records a content hash at
 * install and RE-SCANS every active skill at session start, flagging any file
 * whose bytes changed since it was approved (out-of-band edit) or whose re-scan
 * now raises a warning. It also surfaces what is active, added, and removed since
 * last session, so the set is never silent.
 *
 * Pure + deterministic; the content hash is a real SHA-256 (@noble/hashes). File
 * IO is injected so the whole thing is unit-testable.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { scanSkill, skillScanHasWarnings, type SkillScan } from './skill-scan';

/** A skill the user has approved. The hash pins the exact approved bytes. */
export interface SkillRecord {
  /** Stable id — the declared skill name, else the path. */
  id: string;
  path: string;
  /** SHA-256 (hex) of the exact raw bytes approved at install. */
  contentHash: string;
  /** ISO timestamp of approval (supplied by the caller — no ambient clock here). */
  installedAt: string;
  /** Whether the skill scanned clean at install (a warned skill needs re-consent). */
  approvedClean: boolean;
}

/** SHA-256 (hex) of a skill's raw text — the approved-bytes fingerprint. */
export function hashSkill(raw: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(raw)));
}

/** Derive the stable id for a skill from its scan (declared name, else path). */
export function skillId(scan: SkillScan, path: string): string {
  return scan.name && scan.name.trim().length > 0 ? scan.name.trim() : path;
}

/** Build the install record for a skill from its raw text and approval time. */
export function buildSkillRecord(path: string, raw: string, installedAt: string): SkillRecord {
  const scan = scanSkill(raw, path);
  return {
    id: skillId(scan, path),
    path,
    contentHash: hashSkill(raw),
    installedAt,
    approvedClean: !skillScanHasWarnings(scan),
  };
}

// --- diff since last session -------------------------------------------------

export interface SkillSetDiff {
  added: SkillRecord[];
  removed: SkillRecord[];
  /** Same id, DIFFERENT content hash — edited out-of-band since approval. */
  mutated: { previous: SkillRecord; current: SkillRecord }[];
  /** Unchanged (same id, same hash). */
  unchanged: SkillRecord[];
}

/** Diff two skill sets by id, detecting out-of-band edits via the content hash. */
export function diffSkillSets(previous: SkillRecord[], current: SkillRecord[]): SkillSetDiff {
  const prevById = new Map(previous.map((r) => [r.id, r]));
  const currById = new Map(current.map((r) => [r.id, r]));
  const diff: SkillSetDiff = { added: [], removed: [], mutated: [], unchanged: [] };

  for (const cur of current) {
    const prev = prevById.get(cur.id);
    if (!prev) diff.added.push(cur);
    else if (prev.contentHash !== cur.contentHash) diff.mutated.push({ previous: prev, current: cur });
    else diff.unchanged.push(cur);
  }
  for (const prev of previous) if (!currById.has(prev.id)) diff.removed.push(prev);
  return diff;
}

// --- session-start re-scan (rug-pull defense) --------------------------------

export type ReadFile = (path: string) => Promise<string>;

export interface RescanResult {
  record: SkillRecord;
  /** True if the file is gone (can't re-verify). */
  missing?: boolean;
  /** True if the on-disk bytes differ from the approved hash (out-of-band edit). */
  mutated?: boolean;
  /** True if the current bytes scan with a warning (regardless of hash). */
  nowWarns?: boolean;
  /** The fresh scan (absent if the file is missing). */
  scan?: SkillScan;
}

/** True if a re-scan result must block silent activation (edited or now-warning). */
export function rescanIsBlocking(r: RescanResult): boolean {
  return Boolean(r.missing || r.mutated || r.nowWarns);
}

/**
 * Re-read and re-scan every active skill at session start. Flags any whose bytes
 * changed since approval (rug-pull) or whose fresh scan now warns. A skill that
 * fails re-verification must be re-consented (Lock 2) before it is active again —
 * this function reports; it never silently re-approves.
 */
export async function rescanActiveSkills(
  records: SkillRecord[],
  readFile: ReadFile,
): Promise<RescanResult[]> {
  const results: RescanResult[] = [];
  for (const record of records) {
    let raw: string;
    try {
      raw = await readFile(record.path);
    } catch {
      results.push({ record, missing: true });
      continue;
    }
    const currentHash = hashSkill(raw);
    const scan = scanSkill(raw, record.path);
    results.push({
      record,
      mutated: currentHash !== record.contentHash,
      nowWarns: skillScanHasWarnings(scan),
      scan,
    });
  }
  return results;
}
