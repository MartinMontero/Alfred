// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import type { Haptics } from '../types';

function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}

export const haptics: Haptics = {
  async impact(style) {
    vibrate(style === 'heavy' ? 30 : style === 'medium' ? 15 : 10);
  },
  async notification(style) {
    if (style === 'error') vibrate([20, 50, 20]);
    else if (style === 'warning') vibrate([15, 40, 15]);
    else vibrate(20);
  },
  async selection() {
    vibrate(5);
  },
  async vibrate(durationMs) {
    vibrate(durationMs);
  },
};
