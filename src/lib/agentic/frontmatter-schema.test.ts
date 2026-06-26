// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  validateFrontmatterObject,
  validateNoteContent,
  buildFrontmatter,
  extractWikilinks,
  findMalformedWikilinks,
  generateStableId,
  lintNote,
  DESCRIPTION_MAX,
} from './frontmatter-schema';

const valid = {
  id: 'a-note',
  description: 'A load-bearing one-line summary of what this note is about.',
  tags: ['alpha', 'beta'],
  domain: 'engineering',
  updated: '2026-06-25',
};

describe('frontmatter schema — valid input passes', () => {
  it('accepts a fully-populated, well-formed object', () => {
    const r = validateFrontmatterObject(valid);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('round-trips: buildFrontmatter -> validateNoteContent is valid', () => {
    const fm = buildFrontmatter(valid);
    const note = `${fm}\n\n# Body\n`;
    expect(validateNoteContent(note).valid).toBe(true);
  });
});

describe('frontmatter schema — malformed input is rejected', () => {
  it('rejects a missing description', () => {
    const r = validateFrontmatterObject({ ...valid, description: undefined });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'description')).toBe(true);
  });

  it('rejects a description longer than the cap', () => {
    const r = validateFrontmatterObject({ ...valid, description: 'x'.repeat(DESCRIPTION_MAX + 1) });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'description')).toBe(true);
  });

  it('rejects a missing id', () => {
    const r = validateFrontmatterObject({ ...valid, id: '' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'id')).toBe(true);
  });

  it('rejects tags that are not a list', () => {
    const r = validateFrontmatterObject({ ...valid, tags: 'alpha' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'tags')).toBe(true);
  });

  it('rejects a non-ISO updated date', () => {
    const r = validateFrontmatterObject({ ...valid, updated: 'yesterday' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'updated')).toBe(true);
  });

  it('rejects a missing domain', () => {
    const r = validateFrontmatterObject({ ...valid, domain: '   ' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'domain')).toBe(true);
  });

  it('rejects content with no frontmatter block at all', () => {
    expect(validateNoteContent('# Just a heading\n').valid).toBe(false);
  });

  it('warns (but does not fail) on a too-short description', () => {
    const r = validateFrontmatterObject({ ...valid, description: 'tiny' });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.field === 'description')).toBe(true);
  });
});

describe('wikilink helpers', () => {
  it('extracts targets, stripping aliases and headings', () => {
    const links = extractWikilinks('see [[brain/NORTH_STAR]] and [[memory-bank/progress|progress]] and [[a#section]]');
    expect(links).toEqual(['brain/NORTH_STAR', 'memory-bank/progress', 'a']);
  });

  it('flags empty and unbalanced wikilinks', () => {
    expect(findMalformedWikilinks('broken [[]] here').length).toBeGreaterThan(0);
    expect(findMalformedWikilinks('open [[no close on this line').length).toBeGreaterThan(0);
    expect(findMalformedWikilinks('fine [[brain/RULES]]')).toHaveLength(0);
  });
});

describe('generateStableId', () => {
  it('is deterministic given a clock + entropy and unique-ish otherwise', () => {
    expect(generateStableId(0, 'abcdef')).toBe(generateStableId(0, 'abcdef'));
    expect(generateStableId(1, 'abcdef')).not.toBe(generateStableId(0, 'abcdef'));
  });
});

describe('lintNote — PostToolUse-style save validator', () => {
  it('passes a plain note with no frontmatter (does not force the schema)', () => {
    expect(lintNote('# Just notes\n\nNo frontmatter here.').errors).toHaveLength(0);
  });

  it('flags malformed wikilinks even without frontmatter', () => {
    expect(lintNote('see [[]] broken').errors.length).toBeGreaterThan(0);
  });

  it('validates frontmatter when it is present', () => {
    expect(lintNote('---\nid: x\n---\n# body').errors.length).toBeGreaterThan(0);
  });

  it('passes a well-formed agentic note with good wikilinks', () => {
    const good = buildFrontmatter(valid) + '\n\nlinks [[brain/RULES]]';
    expect(lintNote(good).errors).toHaveLength(0);
  });
});
