// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import type { Shell } from '../types';

export const shell: Shell = {
  openInDefaultApp(path) {
    return invoke<void>('open_in_default_app', { path });
  },
  showInFolder(path) {
    return invoke<void>('show_in_folder', { path });
  },
  openExternal(url) {
    return open(url);
  },
};
