// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { getVersion, onBackButtonPress } from '@tauri-apps/api/app';
import type { AppLifecycle } from '../types';

export const app: AppLifecycle = {
  getVersion() {
    return getVersion();
  },
  async onBackButton(cb) {
    const listener = await onBackButtonPress((event) => {
      void cb({ canGoBack: event.canGoBack });
    });
    return () => {
      void listener.unregister();
    };
  },
};
