// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import type { PlatformAdapter, PlatformInfo } from '../types';
import { cachedPlatformInfo, defaultPlatformInfo, fetchPlatformInfo } from './info';
import { vault } from './vault';
import { assets } from './assets';
import { secrets } from './secrets';
import { settings } from './settings';
import { search } from './search';
import { dialog } from './dialog';
import { clipboard } from './clipboard';
import { deepLink } from './deep-link';
import { shell } from './shell';
import { notifications } from './notifications';
import { haptics } from './haptics';
import { biometric } from './biometric';
import { ai } from './ai';
import { app } from './app';

const adapterState = { info: defaultPlatformInfo() };

async function refreshInfo(): Promise<PlatformInfo> {
  const info = await fetchPlatformInfo();
  adapterState.info = info;
  return info;
}

export const platform: PlatformAdapter = {
  get info() {
    return cachedPlatformInfo() ?? adapterState.info;
  },
  refreshInfo,
  vault,
  assets,
  secrets,
  settings,
  search,
  dialog,
  clipboard,
  deepLink,
  shell,
  notifications,
  haptics,
  biometric,
  ai,
  app,
};

export type { PlatformAdapter, PlatformInfo };
