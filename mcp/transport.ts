// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Transport selection (Phase 3 — Alfred MCP server), isolated so the 2026-07-28
 * spec / v2 SDK migration stays local to this file.
 *
 * Default — and the only thing enabled by default — is **stdio**. Streamable
 * HTTP is opt-in via ALFRED_MCP_HTTP and, when enabled, binds to loopback with
 * **DNS-rebinding protection on** (allowedHosts/allowedOrigins pinned to
 * localhost), per the spec's Host-header protection guidance.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface TransportConfig {
  http: boolean;
  httpHost: string;
  httpPort: number;
}

export function transportConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TransportConfig {
  return {
    http: env.ALFRED_MCP_HTTP === '1' || env.ALFRED_MCP_HTTP === 'true',
    httpHost: env.ALFRED_MCP_HTTP_HOST ?? '127.0.0.1',
    httpPort: Number(env.ALFRED_MCP_HTTP_PORT ?? '3939'),
  };
}

export interface ConnectedTransport {
  kind: 'stdio' | 'http';
  close: () => Promise<void>;
}

export async function connect(server: McpServer, config: TransportConfig): Promise<ConnectedTransport> {
  if (!config.http) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return { kind: 'stdio', close: async () => { await transport.close(); } };
  }

  // Opt-in HTTP. Loopback-bound + DNS-rebinding protection on.
  const [{ StreamableHTTPServerTransport }, http] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
    import('node:http'),
  ]);

  const host = `${config.httpHost}:${config.httpPort}`;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless, local-only
    enableDnsRebindingProtection: true,
    allowedHosts: [host, `localhost:${config.httpPort}`],
    allowedOrigins: [`http://${host}`, `http://localhost:${config.httpPort}`],
  });
  await server.connect(transport);

  const httpServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      let body: unknown;
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
      } catch {
        body = undefined;
      }
      transport.handleRequest(req, res, body).catch((e) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    });
  });
  await new Promise<void>((resolve) => httpServer.listen(config.httpPort, config.httpHost, () => resolve()));

  return {
    kind: 'http',
    close: async () => {
      await transport.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
