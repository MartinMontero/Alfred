// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  hashSkill,
  buildSkillRecord,
  diffSkillSets,
  rescanActiveSkills,
  rescanIsBlocking,
  type SkillRecord,
} from './skill-registry';

const SKILL_A = `---
name: Skill A
description: Does A.
---
Do A carefully.
`;
const SKILL_B = `---
name: Skill B
description: Does B.
---
Do B carefully.
`;

describe('hashSkill', () => {
  it('is deterministic and change-sensitive', () => {
    expect(hashSkill(SKILL_A)).toBe(hashSkill(SKILL_A));
    expect(hashSkill(SKILL_A)).not.toBe(hashSkill(SKILL_A + ' '));
    expect(hashSkill(SKILL_A)).toHaveLength(64); // sha-256 hex
  });
});

describe('buildSkillRecord', () => {
  it('records id from the declared name, the content hash, and clean status', () => {
    const r = buildSkillRecord('skills/a/SKILL.md', SKILL_A, '2026-07-13T00:00:00Z');
    expect(r.id).toBe('Skill A');
    expect(r.contentHash).toBe(hashSkill(SKILL_A));
    expect(r.approvedClean).toBe(true);
  });

  it('marks a skill with a hidden payload as not-clean at install', () => {
    const r = buildSkillRecord('skills/x/SKILL.md', SKILL_A + 'x\u{E0041}', '2026-07-13T00:00:00Z');
    expect(r.approvedClean).toBe(false);
  });
});

describe('diffSkillSets — visibility since last session', () => {
  it('reports added, removed, mutated, and unchanged by id + hash', () => {
    const prevA = buildSkillRecord('skills/a/SKILL.md', SKILL_A, '2026-07-13T00:00:00Z');
    const prevB = buildSkillRecord('skills/b/SKILL.md', SKILL_B, '2026-07-13T00:00:00Z');
    // A edited out-of-band, B removed, C added
    const curA = buildSkillRecord('skills/a/SKILL.md', SKILL_A + '\nEXTRA LINE.', '2026-07-13T01:00:00Z');
    const curC = buildSkillRecord('skills/c/SKILL.md', SKILL_B.replace('Skill B', 'Skill C'), '2026-07-13T01:00:00Z');

    const diff = diffSkillSets([prevA, prevB], [curA, curC]);
    expect(diff.mutated.map((m) => m.current.id)).toEqual(['Skill A']);
    expect(diff.removed.map((r) => r.id)).toEqual(['Skill B']);
    expect(diff.added.map((r) => r.id)).toEqual(['Skill C']);
    expect(diff.unchanged).toEqual([]);
  });
});

describe('rescanActiveSkills — Lock 3 rug-pull defense', () => {
  // CANARY: a skill approved clean, then edited on disk after install, MUST be
  // flagged at session start. This is the rug-pull the lock exists to catch.
  it('CANARY: fires on a file mutated after install (approve benign, swap malicious)', async () => {
    const record = buildSkillRecord('skills/a/SKILL.md', SKILL_A, '2026-07-13T00:00:00Z');
    // The on-disk file now carries a Tags-block payload it did not have at install.
    const mutatedDisk = SKILL_A + 'now malicious\u{E0072}\u{E006D}';
    const readFile = async () => mutatedDisk;

    const [result] = await rescanActiveSkills([record], readFile);
    expect(result.mutated).toBe(true); // hash changed
    expect(result.nowWarns).toBe(true); // and it now scans dirty
    expect(rescanIsBlocking(result)).toBe(true);
  });

  it('passes an unchanged, still-clean skill', async () => {
    const record = buildSkillRecord('skills/a/SKILL.md', SKILL_A, '2026-07-13T00:00:00Z');
    const readFile = async () => SKILL_A; // identical bytes
    const [result] = await rescanActiveSkills([record], readFile);
    expect(result.mutated).toBe(false);
    expect(result.nowWarns).toBe(false);
    expect(rescanIsBlocking(result)).toBe(false);
  });

  it('flags a skill whose file has vanished (cannot re-verify)', async () => {
    const record = buildSkillRecord('skills/a/SKILL.md', SKILL_A, '2026-07-13T00:00:00Z');
    const readFile = async () => {
      throw new Error('ENOENT');
    };
    const [result] = await rescanActiveSkills([record], readFile);
    expect(result.missing).toBe(true);
    expect(rescanIsBlocking(result)).toBe(true);
  });

  it('detects an out-of-band edit even if the edited file is still clean (hash-based)', async () => {
    const record: SkillRecord = buildSkillRecord('skills/a/SKILL.md', SKILL_A, '2026-07-13T00:00:00Z');
    const editedButClean = SKILL_A + '\nAn innocuous extra sentence.';
    const [result] = await rescanActiveSkills([record], async () => editedButClean);
    expect(result.mutated).toBe(true); // caught by hash, not by content warning
    expect(result.nowWarns).toBe(false);
    expect(rescanIsBlocking(result)).toBe(true);
  });
});
