// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Deterministic tool-permission gate (Phase 5 Step 2) — closes the Auto-mode
 * bypass. **Zero LLM inference** (goose `approve` mode, never `smart_approve`).
 *
 * ENFORCEMENT model (post title-keying fix, 2026-07-12 — docs/threat-model.md §3):
 *   1) the curated `permission.yaml` (goose-side) is the ONLY automatic layer;
 *      it keys on stable namespaced `(extension__tool_name)` ids: `always_allow`
 *      for the read-only vault tools (so safe reads don't prompt-fatigue),
 *      `ask_before` for every write and the shell surface; and
 *   2) every `requestPermission` that reaches Alfred is answered by a HUMAN.
 *      There is no Alfred-side auto-allow: ACP `title`/`kind` are agent-authored
 *      display metadata and MUST NEVER answer a permission request. The hint
 *      helper below is observability-only (badge text), spoofable by design,
 *      and returns no decision type.
 */

import { stringify as stringifyYaml } from 'yaml';
import type { ToolKind, PermissionOption } from '@agentclientprotocol/sdk';

/** The Alfred vault MCP extension name (matches docs/mcp-server.md + distribution config). */
export const ALFRED_VAULT_EXTENSION = 'alfred-vault';

/** Phase-3 read-only vault tools — safe to run without a prompt. */
export const VAULT_READ_TOOLS = [
  'vault_search',
  'vault_read',
  'frontmatter_get',
  'memory_bank_read',
  'hot_read',
  'spec_read',
] as const;

/** Phase-3 vault write tools — always gated. */
export const VAULT_WRITE_TOOLS = [
  'vault_append',
  'vault_patch',
  'vault_write',
  'frontmatter_set',
  'memory_bank_update',
] as const;

/** goose's built-in shell/command surface (developer extension) — always gated. */
export const GOOSE_SHELL_TOOL = 'developer__shell';

// EXACT identifiers for the read-only tools. Auto-allow requires an exact match —
// NOT a substring — so a crafted name like "vault_read_and_delete" can never slip
// onto the silent-allow path. Covers the bare tool name and the namespaced id in
// both the hyphen and underscore extension-name forms goose might emit.
const READ_TOOL_IDS = new Set<string>([
  ...VAULT_READ_TOOLS,
  ...[ALFRED_VAULT_EXTENSION, ALFRED_VAULT_EXTENSION.replace(/-/g, '_')].flatMap((ext) =>
    VAULT_READ_TOOLS.map((t) => `${ext}__${t}`),
  ),
]);

// registerTool titles (lower-cased), the other exact form goose may send.
const READ_TOOL_TITLES = new Set<string>([
  'search the vault',
  'read a note',
  'get frontmatter',
  'read a memory bank file',
  'read hot.md',
  'read a spec',
]);

const MUTATING_KINDS = new Set<ToolKind>(['edit', 'delete', 'move', 'execute', 'switch_mode']);

/** Observability hint — NEVER a permission decision (see header). */
export type ToolCallHint = 'vault-read-like' | 'unknown';

export interface GatedToolCall {
  title?: string | null;
  kind?: ToolKind | null;
}

/**
 * Describe a tool call for DISPLAY purposes only: "vault-read-like" when the
 * agent-authored title/kind exactly matches a known read-only vault tool shape.
 * The input is spoofable by construction (title and kind are authored by the
 * agent/tool side of ACP), so this value may badge a prompt — it must never
 * answer one. There is deliberately no function in this module that converts a
 * title into an allow.
 */
export function describeToolCallHint(tc: GatedToolCall | undefined): ToolCallHint {
  if (!tc) return 'unknown';
  if (tc.kind != null && MUTATING_KINDS.has(tc.kind)) return 'unknown';
  const title = (tc.title ?? '').trim();
  if (READ_TOOL_IDS.has(title) || READ_TOOL_TITLES.has(title.toLowerCase())) {
    return 'vault-read-like';
  }
  return 'unknown';
}

export type PermissionDecision =
  | { outcome: { outcome: 'selected'; optionId: string } }
  | { outcome: { outcome: 'cancelled' } };

/** Pick an "allow" option from the offered permission options, or cancel if none. */
export function selectAllowOption(options: PermissionOption[]): PermissionDecision {
  const allow =
    options.find((o) => o.kind === 'allow_once') ?? options.find((o) => o.kind === 'allow_always');
  return allow
    ? { outcome: { outcome: 'selected', optionId: allow.optionId } }
    : { outcome: { outcome: 'cancelled' } };
}

/** The default-deny decision (no acknowledgement / no handler). */
export const DENY: PermissionDecision = { outcome: { outcome: 'cancelled' } };

/** Build the curated permission.yaml: always_allow read-only vault tools, ask
 *  before every vault write and the shell/command surface.
 *
 *  goose 1.39.0's `PermissionConfig` deserializes THREE required lists
 *  (always_allow, ask_before, never_allow) — omitting any one makes goose reject
 *  the file ("Corrupted permission config") and panic on startup, so the whole
 *  session never launches. `never_allow` is intentionally empty: deny-by-default
 *  is carried by ask_before plus the human acknowledgement surface in
 *  GoosePanel — never by title, never by a goose-side blocklist — and the empty
 *  list satisfies goose's schema without changing the allow/ask semantics. */
export function buildPermissionYaml(extensionName: string = ALFRED_VAULT_EXTENSION): string {
  const ns = (t: string) => `${extensionName}__${t}`;
  const doc = {
    user: {
      always_allow: VAULT_READ_TOOLS.map(ns),
      ask_before: [...VAULT_WRITE_TOOLS.map(ns), GOOSE_SHELL_TOOL],
      never_allow: [] as string[],
    },
  };
  return stringifyYaml(doc);
}

/** Path of the permission.yaml inside Alfred's ISOLATED goose root — never the
 *  user's shared %APPDATA%\Block\goose. */
export function goosePermissionPath(pathRoot: string): string {
  return `${pathRoot.replace(/\\/g, '/')}/config/permission.yaml`;
}
