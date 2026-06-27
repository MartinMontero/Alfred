// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Deterministic tool-permission gate (Phase 5 Step 2) — closes the Auto-mode
 * bypass. **Zero LLM inference** (goose `approve` mode, never `smart_approve`).
 *
 * In approve mode goose asks the client (`requestPermission`) before any tool
 * that is not `always_allow`-listed. Two layers, deny-by-default:
 *   1) a curated `permission.yaml` (goose-side) that `always_allow`s only the
 *      read-only vault tools — so safe reads don't prompt-fatigue; and
 *   2) this gate (Alfred-side): auto-allow ONLY a positively-identified read-only
 *      vault tool; **everything else — writes, shell/command, unknown — must be
 *      explicitly acknowledged.** A write/shell can never be auto-allowed.
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

export type GateDecision = 'auto-allow' | 'ask';

export interface GatedToolCall {
  title?: string | null;
  kind?: ToolKind | null;
}

/**
 * Classify a tool call — deny-by-default. Returns `auto-allow` ONLY for an EXACT
 * match to a known read-only vault tool id/title with a non-mutating kind.
 * **Everything else — writes, shell, unknown, unlisted, look-alike names — returns
 * `ask`.** No inference, no substring matching.
 */
export function classifyToolCall(tc: GatedToolCall | undefined): GateDecision {
  if (!tc) return 'ask';
  if (tc.kind != null && MUTATING_KINDS.has(tc.kind)) return 'ask';
  const title = (tc.title ?? '').trim();
  if (READ_TOOL_IDS.has(title) || READ_TOOL_TITLES.has(title.toLowerCase())) return 'auto-allow';
  return 'ask';
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
 *  before every vault write and the shell/command surface. */
export function buildPermissionYaml(extensionName: string = ALFRED_VAULT_EXTENSION): string {
  const ns = (t: string) => `${extensionName}__${t}`;
  const doc = {
    user: {
      always_allow: VAULT_READ_TOOLS.map(ns),
      ask_before: [...VAULT_WRITE_TOOLS.map(ns), GOOSE_SHELL_TOOL],
    },
  };
  return stringifyYaml(doc);
}

/** Path of the permission.yaml inside Alfred's ISOLATED goose root — never the
 *  user's shared %APPDATA%\Block\goose. */
export function goosePermissionPath(pathRoot: string): string {
  return `${pathRoot.replace(/\\/g, '/')}/config/permission.yaml`;
}
