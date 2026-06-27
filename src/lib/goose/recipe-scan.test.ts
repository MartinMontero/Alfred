// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  scanRecipe,
  resolveRef,
  allFindings,
  scanHasWarnings,
  structuralWarnings,
  findingCounts,
  stageCleanRecipe,
  fullyClean,
  buildRecipePreview,
  type ReadFile,
} from './recipe-scan';

const ZW = String.fromCodePoint(0x200b);
const RLO = String.fromCodePoint(0x202e);
const TAG_H = String.fromCodePoint(0xe0048); // smuggled 'H'

const reader = (files: Record<string, string>): ReadFile => async (p) => {
  if (p in files) return files[p];
  throw new Error(`ENOENT: ${p}`);
};

describe('strip-before-parse', () => {
  it('removes a zero-width hidden inside a YAML key so the cleaned key parses', async () => {
    const raw = `version: "1.0.0"\ntitle: T\ninstruc${ZW}tions: do the thing\n`;
    const scan = await scanRecipe('r.yaml', async () => raw);
    expect(scan.cleanText).toContain('instructions: do the thing');
    expect(scan.instructionsPresent).toBe(true); // parsed off the cleaned AST
    expect(scan.findings.some((f) => f.codepoint === 0x200b)).toBe(true);
  });
});

describe('AST enumeration (preview must match goose’s executor)', () => {
  it('enumerates block-style extensions incl. cmd + args off the AST', async () => {
    const raw = [
      'title: T',
      'instructions: do',
      'prompt: go',
      'extensions:',
      '  - type: stdio',
      '    name: dev',
      '    cmd: npx',
      '    args:',
      '      - tsx',
      '      - server.ts',
      'sub_recipes:',
      '  - name: c',
      '    path: ./c.yaml',
    ].join('\n');
    const scan = await scanRecipe('r.yaml', reader({ 'r.yaml': raw, 'c.yaml': 'title: C\n' }));
    expect(scan.instructionsPresent).toBe(true);
    expect(scan.promptPresent).toBe(true);
    expect(scan.extensions).toHaveLength(1);
    expect(scan.extensions[0].type).toBe('stdio');
    expect(scan.extensions[0].cmd).toBe('npx');
    expect(scan.extensions[0].args).toEqual(['tsx', 'server.ts']);
    expect(scan.subRecipes).toHaveLength(1);
  });

  it('enumerates FLOW-style extensions a regex extractor would miss', async () => {
    const raw = 'title: T\nextensions: [{type: stdio, name: dev, cmd: rm, args: [-rf, /]}]\n';
    const scan = await scanRecipe('r.yaml', async () => raw);
    expect(scan.extensions).toHaveLength(1);
    expect(scan.extensions[0].cmd).toBe('rm');
    expect(scan.extensions[0].args).toEqual(['-rf', '/']);
  });

  it('map-style extensions (config form) are enumerated with the key as name', async () => {
    const raw = 'title: T\nextensions:\n  alfred-vault:\n    type: stdio\n    cmd: npx\n';
    const scan = await scanRecipe('r.yaml', async () => raw);
    expect(scan.extensions[0].name).toBe('alfred-vault');
    expect(scan.extensions[0].cmd).toBe('npx');
  });

  it('refuses (blocking) when the cleaned recipe is not valid YAML', async () => {
    const raw = 'title: T\nextensions: [ { type: stdio, cmd: rm';
    const scan = await scanRecipe('r.yaml', async () => raw);
    expect(scan.parseError).toBeDefined();
    expect(scanHasWarnings(scan)).toBe(true);
  });
});

describe('sub_recipes recursion', () => {
  it('reads + sanitizes a referenced sub-recipe and carries findings up the tree', async () => {
    const parent = `title: P\ninstructions: orchestrate\nsub_recipes:\n  - name: child\n    path: ./child.yaml\n`;
    const child = `title: C\ninstructions: be${ZW}nign${RLO}\n`;
    const scan = await scanRecipe('recipes/parent.yaml', reader({
      'recipes/parent.yaml': parent,
      'recipes/child.yaml': child,
    }));
    expect(scan.subRecipes[0].scan?.path).toBe('recipes/child.yaml');
    const all = allFindings(scan);
    expect(all.some((f) => f.codepoint === 0x200b)).toBe(true);
    expect(all.some((f) => f.codepoint === 0x202e)).toBe(true);
    expect(scanHasWarnings(scan)).toBe(true);
  });

  it('elevates an unresolved (remote) sub-recipe to a blocking warning, not a silent pass', async () => {
    const parent = `title: P\nsub_recipes:\n  - name: remote\n`;
    const scan = await scanRecipe('p.yaml', reader({ 'p.yaml': parent }));
    expect(scan.subRecipes[0].error).toMatch(/unresolved/i);
    expect(scanHasWarnings(scan)).toBe(true);
    expect(structuralWarnings(scan).some((w) => /unresolved/i.test(w.message))).toBe(true);
  });

  it('an unreadable sub-recipe blocks too', async () => {
    const parent = `title: P\nsub_recipes:\n  - name: gone\n    path: ./missing.yaml\n`;
    const scan = await scanRecipe('d/p.yaml', reader({ 'd/p.yaml': parent }));
    expect(scanHasWarnings(scan)).toBe(true);
    expect(structuralWarnings(scan).some((w) => /could not read/i.test(w.message))).toBe(true);
  });

  it('guards against cycles', async () => {
    const a = `title: A\nsub_recipes:\n  - name: b\n    path: ./b.yaml\n`;
    const b = `title: B\nsub_recipes:\n  - name: a\n    path: ./a.yaml\n`;
    const scan = await scanRecipe('d/a.yaml', reader({ 'd/a.yaml': a, 'd/b.yaml': b }));
    expect(scan.subRecipes[0].scan?.subRecipes[0].error).toMatch(/cycle/i);
  });
});

describe('gate / counts', () => {
  it('counts stripped vs warning findings across the tree', async () => {
    const raw = `title: T\ninstructions: "${ZW}${ZW}safe${RLO}${TAG_H}"\n`;
    const scan = await scanRecipe('r.yaml', async () => raw);
    const counts = findingCounts(scan);
    expect(counts.stripped).toBe(2);
    expect(counts.warnings).toBe(2); // RLO + Tag
    expect(scanHasWarnings(scan)).toBe(true);
  });
});

describe('resolveRef', () => {
  it('resolves relative refs against the parent dir', () => {
    expect(resolveRef('a/b/parent.yaml', './child.yaml')).toBe('a/b/child.yaml');
    expect(resolveRef('a/b/parent.yaml', '../shared/x.yaml')).toBe('a/shared/x.yaml');
    expect(resolveRef('C:/v/r/p.yaml', './c.yaml')).toBe('C:/v/r/c.yaml');
  });
});

describe('stageCleanRecipe — the executed tree IS the sanitized tree (parent AND child)', () => {
  it('rewrites even an ABSOLUTE sub-recipe ref to point at the staged CLEAN child', async () => {
    // Absolute ref: without rewriting, the staged parent would resolve back to the
    // ORIGINAL dirty child — "parent clean, reference dirty" theater. This proves it does not.
    const parent = `title: P\ninstructions: "${ZW}x${RLO}"\nsub_recipes:\n  - name: c\n    path: /orig/dirty/c.yaml\n`;
    const child = `title: C\ninstructions: "${ZW}secret${TAG_H}"\n`;
    const read = reader({ 'r/parent.yaml': parent, '/orig/dirty/c.yaml': child });
    const scan = await scanRecipe('r/parent.yaml', read);

    const writes: Record<string, string> = {};
    const staged = await stageCleanRecipe(scan, 'stage', read, async (p, c) => {
      writes[p] = c;
    });

    // 1) every staged file is fully clean (parent and child)
    for (const content of Object.values(writes)) {
      expect(content).not.toContain(ZW);
      expect(content).not.toContain(RLO);
      expect(content).not.toContain(TAG_H);
    }
    // 2) the staged parent's sub-recipe ref resolves INTO the stage — not the original abs path
    const parentDoc = parseYaml(writes[staged.parentPath]) as { sub_recipes: { path: string }[] };
    const childRef = parentDoc.sub_recipes[0].path;
    expect(childRef.startsWith('./')).toBe(true);
    const resolvedChild = resolveRef(staged.parentPath, childRef);
    expect(resolvedChild.startsWith('stage/')).toBe(true);
    // 3) and that referenced staged file exists and is the clean child (its instruction survived)
    expect(writes[resolvedChild]).toBeDefined();
    expect(writes[resolvedChild]).toContain('secret');
    expect(writes[resolvedChild]).not.toContain(TAG_H);
  });

  it('fullyClean removes both stripped and warning chars', () => {
    expect(fullyClean(`a${ZW}b${RLO}c${TAG_H}`)).toBe('abc');
  });
});

describe('buildRecipePreview', () => {
  it('enumerates actions, a strip notice, and each warning distinctly (with decoded payload)', async () => {
    const raw = [
      `title: T`,
      `instructions: "do${ZW}it${TAG_H}"`,
      `extensions:`,
      `  - type: stdio`,
      `    name: dev`,
      `    cmd: rm`,
      `    args: [-rf, /tmp/x]`,
    ].join('\n');
    const scan = await scanRecipe('r.yaml', async () => raw);
    const preview = buildRecipePreview(scan);

    expect(preview.actions.map((a) => a.label)).toContain('instructions');
    const ext = preview.actions.find((a) => a.label.startsWith('extension:'));
    expect(ext?.detail).toBe('runs: rm -rf /tmp/x'); // command surface visible
    expect(preview.notices[0]).toMatch(/1 invisible character/);
    expect(preview.warnings).toHaveLength(1);
    expect(preview.warnings[0].detail).toMatch(/smuggled payload: "H"/); // Tag decoded
  });
});
