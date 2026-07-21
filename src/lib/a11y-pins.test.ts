// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * A11y pin tests — source-level guards for the contrast fixes from the
 * Lighthouse color-contrast audit (a11y round on top of F22). Each pin
 * fails against the pre-fix stylesheet. The CI Lighthouse + axe gates are
 * the runtime backstop; these fail fast and name the rule.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

describe('a11y pins — on-accent text rides the token, never literal white', () => {
  it('onboarding.css has no literal white text (was: primary button 3.22:1 on brass)', () => {
    const css = read('../styles/onboarding.css');
    expect(css).not.toMatch(/color:\s*(white|#fff\b|#ffffff)/i);
  });

  it('the static --accent-text token is black — the check-contrast canon pair (6.52:1 on brass)', () => {
    const css = read('../styles.css');
    expect(css).toMatch(/--accent-text:\s*#000000/);
  });

  it('the onboarding name hint carries no opacity de-emphasis (was 3.07:1 at 13px)', () => {
    const css = read('../styles.css');
    expect(css).not.toMatch(/\.onboarding-name__opt[^}]*opacity\s*:/s);
  });

  it('unlock submit and user chat bubble use the on-accent token (same defect class, live surfaces)', () => {
    const css = read('../styles.css');
    const unlock = css.match(/\.unlock-submit\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(unlock).toContain('var(--accent-text)');
    const bubble =
      css.match(/\.custom-provider-message\.user \.custom-provider-message-content\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(bubble).toContain('var(--accent-text)');
  });
});
