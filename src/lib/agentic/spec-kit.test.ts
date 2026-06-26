// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  buildSpecKitFeature,
  specKitFeaturePaths,
  featureSlug,
  SPECKIT_COMMANDS,
} from './spec-kit';
import { validateNoteContent } from './frontmatter-schema';

const opts = { now: Date.parse('2026-06-25T00:00:00Z') };

describe('Spec Kit flow', () => {
  it('maps each step to a /speckit.* command', () => {
    expect(SPECKIT_COMMANDS.constitution).toBe('/speckit.constitution');
    expect(SPECKIT_COMMANDS.specify).toBe('/speckit.specify');
    expect(SPECKIT_COMMANDS.implement).toBe('/speckit.implement');
  });

  it('slugs feature titles safely', () => {
    expect(featureSlug('Vault Scaffold!')).toBe('vault-scaffold');
    expect(featureSlug('   ')).toBe('feature');
  });

  it('lands spec/plan/tasks artifacts under specs/<feature>/', () => {
    expect(specKitFeaturePaths('Vault Scaffold', opts)).toEqual([
      'specs/vault-scaffold',
      'specs/vault-scaffold/spec.md',
      'specs/vault-scaffold/plan.md',
      'specs/vault-scaffold/tasks.md',
    ]);
  });

  it('every artifact has valid load-bearing frontmatter', () => {
    for (const e of buildSpecKitFeature('Vault Scaffold', opts)) {
      if (e.kind !== 'file') continue;
      expect(validateNoteContent(e.content!).valid, e.path).toBe(true);
    }
  });

  it('born-compliant: the spec inherits the constitution', () => {
    const spec = buildSpecKitFeature('Vault Scaffold', opts).find((e) => e.path.endsWith('spec.md'))!.content!;
    expect(spec).toMatch(/\[\[brain\/constitution\]\]/);
    expect(spec).toMatch(/Meta \/ OpenAI \/ xAI/);
  });
});
