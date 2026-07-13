// SPDX-License-Identifier: AGPL-3.0-or-later
// DELIBERATE CI-FAIL CANARY (Stage D, D6). This test MUST fail so we can prove
// the CI gate actually blocks red builds. Delete this file + branch after the
// run goes red — it must never reach the designated branch.
import { describe, it, expect } from 'vitest';

describe('CI-fail canary (must fail on purpose)', () => {
  it('proves the CI gate blocks a failing test', () => {
    expect(1 + 1).toBe(3);
  });
});
