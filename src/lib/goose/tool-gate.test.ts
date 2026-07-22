// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  describeToolCallHint,
  selectAllowOption,
  VAULT_WRITE_TOOLS,
  GOOSE_SHELL_TOOL,
} from './tool-gate';
import * as toolGateModule from './tool-gate';

// permission.yaml generation moved to Rust (guard::build_permission_yaml,
// ADR-0008) since the whole isolated distribution is now prepared behind the
// guarded spawn. Its shape pins (the three-list schema goose requires; the
// id-keyed always_allow/ask_before enforcement) live in
// src-tauri/src/guard_tests.rs::permission_yaml_carries_the_three_required_lists.
// This file keeps the pure ACP permission-response hint tests.

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

