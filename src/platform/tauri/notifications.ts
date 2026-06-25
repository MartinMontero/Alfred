// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { Notifications } from '../types';

export const notifications: Notifications = {
  async isPermissionGranted() {
    return isPermissionGranted();
  },
  async requestPermission() {
    const result = await requestPermission();
    return result === 'granted';
  },
  async send(title, body) {
    sendNotification({ title, body });
  },
};
