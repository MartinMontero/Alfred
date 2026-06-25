// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, Settings } from '../types';

export const settings: Settings = {
  load() {
    return invoke<AppSettings>('load_settings');
  },
  async save(value) {
    await invoke<void>('save_settings', { settings: value });
  },
};
