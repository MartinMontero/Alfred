// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Alfred's goose harness integration. Provider policy is compiled (holmes-guard,
 * ADR-0008) and reached through the guard transport; the ACP client, guard
 * transport, and recipe runner are desktop-only (Tauri). The tool-gate helpers
 * are pure (ACP permission-response hints).
 */
export * from './guard-transport';
export * from './acp-client';
export * from './tool-gate';
export * from './recipe-scan';
export * from './recipes';
