// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Assets } from '../types';

export const assets: Assets = {
  resolveAssetUrl(absolutePath) {
    return convertFileSrc(absolutePath);
  },
};
