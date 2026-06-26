// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Vault filesystem with strict path confinement (Phase 3 — Alfred MCP server).
 *
 * The security core of the MCP server. Every path that reaches disk passes
 * through `resolve()`, which treats the input as untrusted (it comes from an
 * LLM) and confines it to the vault root. Traversal is rejected EXPLICITLY and
 * platform-independently — `../`, `..\`, absolute `C:\`, drive-relative `C:foo`,
 * UNC `\\server\share`, and root-relative `/x` / `\x` are all refused — rather
 * than relying on the host platform's `path` semantics alone.
 *
 * Standalone Node (node:fs / node:path); not the Tauri @platform layer. It
 * exposes the on-disk vault that the Phase-2 agentic modules define.
 */

import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';

export class VaultPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultPathError';
  }
}

const DRIVE_LETTER = /^[a-zA-Z]:/; // C:\  C:/  C:foo (absolute or drive-relative)
const UNC = /^[\\/]{2}/; // \\server\share  or  //server/share
const ROOT_RELATIVE = /^[\\/]/; // \foo  or  /foo

export class VaultFs {
  readonly root: string;

  constructor(vaultRoot: string) {
    // Normalize the trusted root to an absolute path once.
    this.root = nodePath.resolve(vaultRoot);
  }

  /**
   * Resolve an untrusted, vault-relative path to a safe absolute path inside the
   * vault — or throw VaultPathError. Defense in depth: explicit rejection of
   * every traversal shape, then a resolved-containment check.
   */
  resolve(userPath: string): string {
    if (typeof userPath !== 'string' || userPath.trim() === '') {
      throw new VaultPathError('Path must be a non-empty string.');
    }
    if (userPath.includes('\0')) {
      throw new VaultPathError('Path contains a null byte.');
    }
    if (DRIVE_LETTER.test(userPath)) {
      throw new VaultPathError(`Absolute / drive path is not allowed: "${userPath}".`);
    }
    if (UNC.test(userPath)) {
      throw new VaultPathError(`UNC path is not allowed: "${userPath}".`);
    }
    if (ROOT_RELATIVE.test(userPath)) {
      throw new VaultPathError(`Root-relative path is not allowed: "${userPath}".`);
    }

    // Split on BOTH separators so "..\\" is caught on any host platform.
    const segments = userPath.split(/[\\/]+/);
    for (const seg of segments) {
      if (seg === '..') throw new VaultPathError(`Path traversal ("..") is not allowed: "${userPath}".`);
    }

    // Resolved-containment check (catches anything the explicit rules missed).
    const resolved = nodePath.resolve(this.root, userPath);
    const rel = nodePath.relative(this.root, resolved);
    if (rel === '..' || rel.startsWith(`..${nodePath.sep}`) || nodePath.isAbsolute(rel)) {
      throw new VaultPathError(`Path escapes the vault root: "${userPath}".`);
    }
    return resolved;
  }

  /** True iff the path is safely inside the vault (never throws). */
  isInside(userPath: string): boolean {
    try {
      this.resolve(userPath);
      return true;
    } catch {
      return false;
    }
  }

  async read(userPath: string): Promise<string> {
    return fs.readFile(this.resolve(userPath), 'utf8');
  }

  async exists(userPath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(userPath));
      return true;
    } catch {
      return false;
    }
  }

  async write(userPath: string, content: string): Promise<void> {
    const abs = this.resolve(userPath);
    await fs.mkdir(nodePath.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }

  /** Recursively list vault-relative POSIX paths (optionally filtered by ext). */
  async list(ext?: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const abs = nodePath.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === '.git' || e.name === 'node_modules') continue;
          await walk(abs);
        } else if (!ext || e.name.toLowerCase().endsWith(ext)) {
          out.push(nodePath.relative(this.root, abs).replace(/\\/g, '/'));
        }
      }
    };
    await walk(this.root);
    return out.sort();
  }
}
