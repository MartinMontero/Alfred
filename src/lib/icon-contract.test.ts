// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * ADR-0007 contract guard — beta.4 FIX 2.
 *
 * The shipped 0.1.2 violated the contract's point 3 (observable effect): the
 * contextual toolbar tools lit up on the Home view while their panels only
 * render with an open note. These pins fail on that exact regression: a
 * note-scoped tool must be DISABLED without a document, and its lit state
 * must be impossible without a rendered panel.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8');
const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf-8');

const TOOLS = ['showOutline', 'showBacklinks', 'showProperties'] as const;

describe('ADR-0007 — contextual toolbar tools are out of context without a note', () => {
  for (const tool of TOOLS) {
    it(`${tool}: desktop button is disabled without currentTab and its lit state is gated`, () => {
      // disabled without a note
      const btn = app.match(
        new RegExp(`classList=\\{\\{ active: ${tool}\\(\\)[^}]*\\}\\}[\\s\\S]{0,220}?disabled=\\{!currentTab\\(\\)\\}`),
      );
      expect(btn, `toolbar button for ${tool} must carry disabled={!currentTab()}`).not.toBeNull();
      // lit state cannot exist without the panel's render condition
      expect(app).toContain(`active: ${tool}() && !!currentTab()`);
      expect(app).toContain(`aria-pressed={${tool}() && !!currentTab()}`);
    });
  }

  it('mobile more-menu items no-op without a note and never render active', () => {
    for (const tool of TOOLS) {
      expect(app).toContain(`\${${tool}() && currentTab() ? 'active' : ''}`);
    }
    const guards = app.match(/if \(!currentTab\(\)\) return;/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(3);
  });

  it('disabled interactive states are styled, not just attribute-d', () => {
    expect(css).toMatch(/\.icon-btn:disabled,\s*\n\.toolbar-tool:disabled\s*\{/);
    expect(css).toMatch(/\.setting-button:disabled[\s\S]{0,120}opacity/);
    expect(css).toContain('.mobile-more-item--disabled');
  });
});
