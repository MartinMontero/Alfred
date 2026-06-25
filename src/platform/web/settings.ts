// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import type { AppSettings, Settings } from '../types';
import { getDB } from './idb';

const KEY = 'app';

export const settings: Settings = {
  async load(): Promise<AppSettings> {
    const db = await getDB();
    const stored = (await db.get('settings', KEY)) as AppSettings | undefined;
    if (stored) return stored;
    return { vault_path: null };
  },
  async save(value): Promise<void> {
    const db = await getDB();
    await db.put('settings', value, KEY);
  },
};
