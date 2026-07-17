// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * W1 fix-wave #3 acceptance tests (ruling B, red-first — the red runs are
 * recorded in docs/audit/; these are the green regression guards).
 *
 * (a) the frontmatter fence survives the editor round-trip,
 * (b) property application is idempotent and never stacks fence blocks,
 * (c) the clean badge fixture parses end-to-end.
 *
 * The `unified`/`remark-*` imports are the SAME engine Milkdown bundles
 * (transitive, pinned via the @milkdown/* entries in package-lock). They are
 * used only to reproduce the editor's serializer headlessly — the field
 * corruption (fence rewritten to `***`, `key:` line turned into a heading)
 * falls straight out of it.
 */
import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import {
  parseFrontmatter,
  splitFrontmatter,
  joinFrontmatter,
  applyPropertiesToContent,
  hasDisplacedFrontmatter,
  type FrontmatterProperty,
} from './frontmatter';
import { propertiesToObject } from './agentic/frontmatter-schema';
import { parseEvidence } from './evidence';

const roundTrip = (md: string) =>
  unified().use(remarkParse).use(remarkStringify).processSync(md).toString();

const FIXTURE = [
  '---',
  'id: note-1',
  'confidence: 0.9',
  'sources:',
  '  - manual clean test',
  '---',
  '',
  'Badge clean test body.',
  '',
].join('\n');

describe('W1 #3 (a) — fence survives the editor round-trip', () => {
  it('mechanism pin: the raw engine rewrites an unprotected fence (why the split exists)', () => {
    const out = roundTrip(FIXTURE);
    // Today's engine turns the fence into a thematic break; if this ever
    // starts passing, the engine changed and the split can be revisited.
    expect(out.startsWith('---')).toBe(false);
    expect(parseFrontmatter(out)).toBeNull();
  });

  it('regression guard: split -> engine -> join preserves the fence', () => {
    const { frontmatter, body } = splitFrontmatter(FIXTURE);
    const rejoined = joinFrontmatter(frontmatter, roundTrip(body));
    expect(rejoined.startsWith('---\nid: note-1')).toBe(true);
    expect(parseFrontmatter(rejoined)).not.toBeNull();
    expect(splitFrontmatter(rejoined).frontmatter).toBe(frontmatter);
  });

  it('split/join is byte-exact across trailing-newline shapes and CRLF', () => {
    for (const sample of [
      FIXTURE,
      '---\r\nid: x\r\n---\r\nbody\r\n',
      '---\nid: x\n---', // fence is the last line, no trailing newline
      '---\nid: x\n---\n',
      'plain prose, no frontmatter\n',
    ]) {
      const s = splitFrontmatter(sample);
      expect(joinFrontmatter(s.frontmatter, s.body)).toBe(sample);
    }
  });
});

describe('W1 #3 (b) — property apply is idempotent / never stacks fences', () => {
  const idProp: FrontmatterProperty[] = [{ key: 'id', value: 'stable-1', type: 'text' }];
  const displaced = ['# Title above the fence', '---', 'id: x', '---', 'body'].join('\n');

  it('displaced block: refuses to write and flags, instead of prepending a second fence', () => {
    const r = applyPropertiesToContent(displaced, idProp);
    expect(r.fenceDisplaced).toBe(true);
    expect(r.content).toBe(displaced);
    expect((r.content.match(/^---$/gm) || []).length).toBe(2); // still ONE block
  });

  it('two applies on a clean note: one fence block, stable content', () => {
    const once = applyPropertiesToContent(FIXTURE, idProp);
    const twice = applyPropertiesToContent(once.content, idProp);
    expect(twice.fenceDisplaced).toBe(false);
    expect(twice.content).toBe(once.content);
    expect((twice.content.match(/^---$/gm) || []).length).toBe(2);
  });

  it('no frontmatter anywhere: prepending IS the intended add-frontmatter path', () => {
    const r = applyPropertiesToContent('just prose\n', idProp);
    expect(r.fenceDisplaced).toBe(false);
    expect(r.content.startsWith('---\n')).toBe(true);
    expect(parseFrontmatter(r.content)).not.toBeNull();
  });

  it('a lone thematic break in prose does not trip the displaced detector', () => {
    expect(hasDisplacedFrontmatter('para one\n\n---\n\npara two\n')).toBe(false);
  });
});

describe('W1 #3 (c) — the clean badge fixture parses end-to-end', () => {
  it('parseFrontmatter -> propertiesToObject -> parseEvidence: marked, band high', () => {
    const parsed = parseFrontmatter(FIXTURE);
    expect(parsed).not.toBeNull();
    const meta = parseEvidence(propertiesToObject(parsed!.properties));
    expect(meta.unmarked).toBe(false);
    expect(meta.band).toBe('high');
    expect(meta.confidence).toBe(0.9);
    expect(meta.sources).toEqual(['manual clean test']);
  });
});
