// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
// Entry point: `tsx mcp/run.ts <vaultRoot>` (or ALFRED_VAULT). Default transport
// is stdio. See docs/mcp-server.md to register with goose / Claude Code.
import { main } from './server';

main().catch((e) => {
  process.stderr.write(`Alfred MCP server failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
