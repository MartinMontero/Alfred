// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { buildScaffoldPlan, scaffoldPaths, TOPOLOGY_FOLDERS } from './topology';
import { validateNoteContent } from './frontmatter-schema';

const opts = { project: 'Test Project', now: Date.parse('2026-06-25T00:00:00Z') };

describe('agentic vault scaffold — topology', () => {
  const plan = buildScaffoldPlan(opts);
  const paths = plan.map((e) => e.path);

  it('creates every required folder', () => {
    for (const folder of TOPOLOGY_FOLDERS) {
      expect(plan.some((e) => e.kind === 'folder' && e.path === folder)).toBe(true);
    }
  });

  it('creates the brain, memory-bank, specs anchors and hot.md', () => {
    for (const f of [
      'hot.md',
      'brain/NORTH_STAR.md',
      'brain/RULES.md',
      'brain/constitution.md',
      'specs/README.md',
      'memory-bank/projectbrief.md',
      'memory-bank/techContext.md',
      'memory-bank/activeContext.md',
      'memory-bank/progress.md',
      'memory-bank/decisions/0000-template.md',
      'domains/README.md',
      'inbox/README.md',
      'daily/README.md',
      'thinking/README.md',
    ]) {
      expect(paths).toContain(f);
    }
  });

  it('gives every seed file valid load-bearing frontmatter', () => {
    for (const e of plan) {
      if (e.kind !== 'file') continue;
      const r = validateNoteContent(e.content!);
      expect(r.valid, `${e.path}: ${r.errors.map((x) => x.message).join(', ')}`).toBe(true);
    }
  });

  it('born-compliant: the constitution inherits the exclusion policy', () => {
    const constitution = plan.find((e) => e.path === 'brain/constitution.md')!.content!;
    expect(constitution).toMatch(/Meta/);
    expect(constitution).toMatch(/OpenAI/);
    expect(constitution).toMatch(/xAI/);
    expect(constitution).toMatch(/React is forbidden/);
    expect(constitution).toMatch(/Soapbox/);
  });

  it('is deterministic for a fixed clock', () => {
    expect(scaffoldPaths(opts)).toEqual(scaffoldPaths(opts));
  });
});
