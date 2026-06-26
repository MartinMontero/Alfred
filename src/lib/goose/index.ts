// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Alfred's goose harness integration. The provider lockdown is pure and isomorphic;
 * the ACP client, distribution writer, and recipe runner are desktop-only (Tauri).
 */
export * from './provider-lockdown';
export * from './acp-client';
export * from './distribution';
export * from './recipes';
