// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
// Entry point (development): `tsx mcp/run.ts <vaultRoot>` (or ALFRED_VAULT). The
// SHIPPED app never runs this file — it runs the pre-bundled
// src-tauri/mcp-bundle/mcp-server.cjs (npm run build:mcp) under the pinned Node
// sidecar (guard.rs bundled_mcp_invocation). Default transport is stdio.
// See docs/mcp-server.md to register with goose / Claude Code.
import { main } from './server';

main().catch((e) => {
  process.stderr.write(`Alfred MCP server failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
