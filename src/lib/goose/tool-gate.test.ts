// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  describeToolCallHint,
  selectAllowOption,
  buildPermissionYaml,
  goosePermissionPath,
  VAULT_READ_TOOLS,
  VAULT_WRITE_TOOLS,
  GOOSE_SHELL_TOOL,
} from './tool-gate';
import * as toolGateModule from './tool-gate';
import { parse as parseYaml } from 'yaml';

// ---------------------------------------------------------------------------
// ENFORCEMENT PIN (threat-model §3, builder decision 2026-07-12): permission
// enforcement keys on (extension__tool_name) in permission.yaml plus a human
// answer for everything goose asks. Agent-authored title/kind must NEVER
// answer a permission request.
// ---------------------------------------------------------------------------
describe('enforcement is never title-keyed (pin)', () => {
  it('tool-gate exports no auto-allow decision path', () => {
    // The old spoofable surface must stay gone.
    expect((toolGateModule as Record<string, unknown>).classifyToolCall).toBeUndefined();
    // The hint helper returns hint strings, never a selectable decision.
    expect(describeToolCallHint({ title: 'Read a note', kind: 'read' })).toBe('vault-read-like');
    expect(describeToolCallHint({ title: 'Read a note', kind: 'read' })).not.toContain('allow');
  });

  it('no product source outside this module references the hint for decisions (source scan)', () => {
    // classifyToolCall must not reappear anywhere in src/ (its only historical
    // caller was GoosePanel.tsx answering requestPermission with it). This scan
    // catches the exact regression; a *renamed* title-keyed decision path is
    // review + threat-model territory, stated honestly.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(entry) && !p.endsWith('tool-gate.test.ts')) {
          if (readFileSync(p, 'utf8').includes('classifyToolCall')) hits.push(p);
        }
      }
    };
    walk('src');
    expect(hits).toEqual([]);
  });
});

describe('describeToolCallHint — observability only, spoofable by design', () => {
  it('labels exact read-tool shapes vault-read-like (id or registered title)', () => {
    expect(describeToolCallHint({ title: 'alfred-vault__vault_read', kind: 'read' })).toBe('vault-read-like');
    expect(describeToolCallHint({ title: 'Read a note', kind: 'read' })).toBe('vault-read-like');
    expect(describeToolCallHint({ title: 'Search the vault', kind: 'search' })).toBe('vault-read-like');
    expect(describeToolCallHint({ title: 'hot_read' })).toBe('vault-read-like');
    expect(describeToolCallHint({ title: 'alfred_vault__hot_read' })).toBe('vault-read-like');
  });

  it('labels writes, shell, unknown, look-alikes, and mutating kinds unknown', () => {
    for (const w of VAULT_WRITE_TOOLS) {
      expect(describeToolCallHint({ title: `alfred-vault__${w}`, kind: 'edit' })).toBe('unknown');
      expect(describeToolCallHint({ title: `alfred-vault__${w}` })).toBe('unknown');
    }
    expect(describeToolCallHint({ title: GOOSE_SHELL_TOOL, kind: 'execute' })).toBe('unknown');
    expect(describeToolCallHint({ title: 'some_unknown_tool' })).toBe('unknown');
    expect(describeToolCallHint({ title: '' })).toBe('unknown');
    expect(describeToolCallHint(undefined)).toBe('unknown');
    // Exact-match discipline: containing a read id is not being one.
    expect(describeToolCallHint({ title: 'vault_read_and_delete_everything' })).toBe('unknown');
    expect(describeToolCallHint({ title: 'alfred-vault__vault_read_evil' })).toBe('unknown');
    expect(describeToolCallHint({ title: 'evil vault_read' })).toBe('unknown');
    // Unlisted stays unknown even with a benign kind; mutating kind beats a read title.
    expect(describeToolCallHint({ title: 'newfangled_tool', kind: 'read' })).toBe('unknown');
    expect(describeToolCallHint({ title: 'vault_read', kind: 'delete' })).toBe('unknown');
    expect(describeToolCallHint({ title: 'vault_read', kind: 'execute' })).toBe('unknown');
  });
});

describe('selectAllowOption (used only after explicit human approval)', () => {
  it('selects an allow option when present, cancels otherwise', () => {
    expect(selectAllowOption([{ optionId: 'a', name: 'Allow', kind: 'allow_once' }])).toEqual({
      outcome: { outcome: 'selected', optionId: 'a' },
    });
    expect(selectAllowOption([{ optionId: 'r', name: 'Reject', kind: 'reject_once' }])).toEqual({
      outcome: { outcome: 'cancelled' },
    });
  });
});

describe('buildPermissionYaml — the id-keyed enforcement layer', () => {
  it('always_allows the read tools and asks before writes + shell, keyed on extension__tool_name', () => {
    const yaml = parseYaml(buildPermissionYaml()) as {
      user: { always_allow: string[]; ask_before: string[] };
    };
    for (const r of VAULT_READ_TOOLS) expect(yaml.user.always_allow).toContain(`alfred-vault__${r}`);
    for (const w of VAULT_WRITE_TOOLS) expect(yaml.user.ask_before).toContain(`alfred-vault__${w}`);
    expect(yaml.user.ask_before).toContain('developer__shell');
    // No write is ever in always_allow.
    for (const w of VAULT_WRITE_TOOLS) expect(yaml.user.always_allow).not.toContain(`alfred-vault__${w}`);
    // Every enforcement entry is a namespaced id or a goose builtin id — never prose.
    for (const entry of [...yaml.user.always_allow, ...yaml.user.ask_before]) {
      expect(entry).toMatch(/^[a-z0-9_-]+__[a-z0-9_]+$/);
    }
  });

  // SECONDARY (cheap) regression guard: goose 1.39.0's PermissionConfig requires
  // all THREE lists — omitting never_allow makes goose panic on startup. This shape
  // check is necessary but NOT sufficient (it would pass even if goose rejected the
  // file); the definitive proof is the goose-start test in permission-startup.test.ts.
  it('emits all three lists goose requires (always_allow, ask_before, never_allow)', () => {
    const yaml = parseYaml(buildPermissionYaml()) as {
      user: { always_allow: string[]; ask_before: string[]; never_allow: string[] };
    };
    expect(Array.isArray(yaml.user.always_allow)).toBe(true);
    expect(Array.isArray(yaml.user.ask_before)).toBe(true);
    expect(Array.isArray(yaml.user.never_allow)).toBe(true);
    expect(yaml.user.never_allow).toEqual([]); // empty: deny-by-default lives elsewhere
  });
});

describe('goosePermissionPath', () => {
  it('resolves under the isolated goose root, never the user’s shared config', () => {
    const isolated = 'C:/Users/u/AppData/Roaming/dev.wecanjustbuildthings.alfred/goose';
    const p = goosePermissionPath(isolated);
    expect(p).toBe(`${isolated}/config/permission.yaml`);
    expect(p).not.toContain('Block/goose');
  });
});
