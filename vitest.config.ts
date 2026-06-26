// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { defineConfig } from 'vitest/config';

// Standalone test config (does not load the app's Vite plugins / @platform alias)
// so pure unit tests run in a fast Node environment with no DOM dependency.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
