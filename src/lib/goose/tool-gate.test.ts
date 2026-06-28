// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  classifyToolCall,
  selectAllowOption,
  buildPermissionYaml,
  goosePermissionPath,
  VAULT_READ_TOOLS,
  VAULT_WRITE_TOOLS,
  GOOSE_SHELL_TOOL,
} from './tool-gate';
import { parse as parseYaml } from 'yaml';

describe('classifyToolCall — deny-by-default, reads auto-allow', () => {
  it('auto-allows read-only vault tools (by tool id or human title)', () => {
    expect(classifyToolCall({ title: 'alfred-vault__vault_read', kind: 'read' })).toBe('auto-allow');
    expect(classifyToolCall({ title: 'Read a note', kind: 'read' })).toBe('auto-allow');
    expect(classifyToolCall({ title: 'Search the vault', kind: 'search' })).toBe('auto-allow');
    expect(classifyToolCall({ title: 'hot_read' })).toBe('auto-allow'); // kind absent → still allowed if read
  });

  it('asks for every vault WRITE tool', () => {
    for (const w of VAULT_WRITE_TOOLS) {
      expect(classifyToolCall({ title: `alfred-vault__${w}`, kind: 'edit' })).toBe('ask');
    }
  });

  it('asks for the shell/command surface (closes the Auto bypass)', () => {
    expect(classifyToolCall({ title: GOOSE_SHELL_TOOL, kind: 'execute' })).toBe('ask');
    expect(classifyToolCall({ title: 'developer__shell', kind: 'execute' })).toBe('ask');
  });

  it('asks for unknown tools and missing tool calls (deny-by-default)', () => {
    expect(classifyToolCall({ title: 'some_unknown_tool' })).toBe('ask');
    expect(classifyToolCall({ title: '' })).toBe('ask');
    expect(classifyToolCall(undefined)).toBe('ask');
  });

  it('never auto-allows a read-looking title with a mutating kind', () => {
    expect(classifyToolCall({ title: 'vault_read', kind: 'delete' })).toBe('ask');
    expect(classifyToolCall({ title: 'vault_read', kind: 'execute' })).toBe('ask');
  });
});

describe('classifyToolCall — exact-match, no open gaps (Check 2 hardening)', () => {
  it('a look-alike name that merely CONTAINS a read tool id is asked, not allowed', () => {
    expect(classifyToolCall({ title: 'vault_read_and_delete_everything' })).toBe('ask');
    expect(classifyToolCall({ title: 'alfred-vault__vault_read_evil' })).toBe('ask');
    expect(classifyToolCall({ title: 'evil vault_read' })).toBe('ask');
  });

  it('an UNLISTED tool is asked even if its kind is read (forgot-to-list → ask, never silent)', () => {
    expect(classifyToolCall({ title: 'newfangled_tool', kind: 'read' })).toBe('ask');
    expect(classifyToolCall({ title: 'developer__text_editor', kind: 'read' })).toBe('ask');
  });

  it('a write tool with NO kind annotation is still asked (exact id is not on the read set)', () => {
    expect(classifyToolCall({ title: 'alfred-vault__vault_write' })).toBe('ask');
    expect(classifyToolCall({ title: 'alfred-vault__memory_bank_update' })).toBe('ask');
  });

  it('the exact known read ids (hyphen and underscore extension forms) still auto-allow', () => {
    expect(classifyToolCall({ title: 'alfred-vault__vault_read', kind: 'read' })).toBe('auto-allow');
    expect(classifyToolCall({ title: 'alfred_vault__hot_read' })).toBe('auto-allow');
  });
});

describe('selectAllowOption', () => {
  it('selects an allow option when present, cancels otherwise', () => {
    expect(selectAllowOption([{ optionId: 'a', name: 'Allow', kind: 'allow_once' }])).toEqual({
      outcome: { outcome: 'selected', optionId: 'a' },
    });
    expect(selectAllowOption([{ optionId: 'r', name: 'Reject', kind: 'reject_once' }])).toEqual({
      outcome: { outcome: 'cancelled' },
    });
  });
});

describe('buildPermissionYaml', () => {
  it('always_allows the read tools and asks before writes + shell', () => {
    const yaml = parseYaml(buildPermissionYaml()) as {
      user: { always_allow: string[]; ask_before: string[] };
    };
    for (const r of VAULT_READ_TOOLS) expect(yaml.user.always_allow).toContain(`alfred-vault__${r}`);
    for (const w of VAULT_WRITE_TOOLS) expect(yaml.user.ask_before).toContain(`alfred-vault__${w}`);
    expect(yaml.user.ask_before).toContain('developer__shell');
    // No write is ever in always_allow.
    for (const w of VAULT_WRITE_TOOLS) expect(yaml.user.always_allow).not.toContain(`alfred-vault__${w}`);
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
