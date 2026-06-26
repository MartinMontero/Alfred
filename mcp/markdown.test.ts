// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { appendUnderHeading, replaceUnderHeading } from './markdown';

const doc = `# Title

## Open loops
- first

## Done
- shipped
`;

describe('appendUnderHeading — structure-preserving, never clobbers', () => {
  it('appends under an existing heading without touching other sections', () => {
    const out = appendUnderHeading(doc, 'Open loops', '- second');
    expect(out).toMatch(/## Open loops\n- first\n\n- second/);
    expect(out).toContain('- shipped'); // Done section untouched
  });

  it('adds a new section when the heading is absent', () => {
    const out = appendUnderHeading(doc, 'New', '- fresh');
    expect(out).toMatch(/## New\n\n- fresh/);
    expect(out).toContain('- first');
  });
});

describe('replaceUnderHeading', () => {
  it('replaces a section body, keeping the heading and other sections', () => {
    const out = replaceUnderHeading(doc, 'Open loops', '- replaced');
    expect(out).toContain('## Open loops');
    expect(out).toContain('- replaced');
    expect(out).not.toContain('- first');
    expect(out).toContain('- shipped');
  });

  it('throws when the heading is absent', () => {
    expect(() => replaceUnderHeading(doc, 'Nope', 'x')).toThrow();
  });
});
