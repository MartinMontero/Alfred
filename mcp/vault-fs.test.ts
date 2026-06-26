// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { VaultFs, VaultPathError } from './vault-fs';

let root: string;
let vault: VaultFs;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'alfred-vault-'));
  vault = new VaultFs(root);
  await fs.mkdir(path.join(root, 'brain'), { recursive: true });
  await fs.writeFile(path.join(root, 'hot.md'), '# hot', 'utf8');
  await fs.writeFile(path.join(root, 'brain', 'RULES.md'), '# rules', 'utf8');
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('VaultFs — path confinement refuses every traversal shape (platform-independent)', () => {
  const attacks: Array<[string, string]> = [
    ['Unix parent', '../etc/passwd'],
    ['Windows parent', '..\\Windows\\System32\\config'],
    ['nested Unix escape', 'brain/../../escape'],
    ['nested Windows escape', 'brain\\..\\..\\escape'],
    ['absolute Windows (backslash)', 'C:\\Windows\\System32'],
    ['absolute Windows (forward)', 'C:/Windows/System32'],
    ['drive-relative', 'C:secret'],
    ['UNC backslash', '\\\\server\\share\\x'],
    ['UNC forward', '//server/share/x'],
    ['root-relative Unix', '/etc/passwd'],
    ['root-relative Windows', '\\Windows\\x'],
    ['mixed traversal', 'a/../../b'],
  ];

  for (const [label, p] of attacks) {
    it(`refuses ${label}: ${JSON.stringify(p)}`, () => {
      expect(() => vault.resolve(p)).toThrow(VaultPathError);
      expect(vault.isInside(p)).toBe(false);
    });
  }

  it('refuses empty and null-byte paths', () => {
    expect(() => vault.resolve('')).toThrow(VaultPathError);
    expect(() => vault.resolve('   ')).toThrow(VaultPathError);
    expect(() => vault.resolve('a\0b')).toThrow(VaultPathError);
  });

  it('refuses reading outside the vault via traversal', async () => {
    await expect(vault.read('../whatever.txt')).rejects.toThrow(VaultPathError);
  });
});

describe('VaultFs — allows legitimate vault-relative paths', () => {
  it('accepts nested vault-relative paths', () => {
    expect(vault.isInside('brain/RULES.md')).toBe(true);
    expect(vault.isInside('memory-bank/decisions/0001-x.md')).toBe(true);
    expect(vault.isInside('hot.md')).toBe(true);
  });

  it('reads a file inside the vault', async () => {
    expect(await vault.read('hot.md')).toBe('# hot');
  });

  it('write creates parents and list stays inside the vault', async () => {
    await vault.write('inbox/capture.md', 'hello');
    const list = await vault.list('.md');
    expect(list).toContain('inbox/capture.md');
    expect(list.every((p) => !p.includes('..'))).toBe(true);
  });
});
