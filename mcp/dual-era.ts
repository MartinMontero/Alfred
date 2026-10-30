// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Dual-era MCP negotiation shim (2026-10-29).
 *
 * Canon: Alfred's MCP server MUST be dual-era until goose ships a modern MCP
 * client — answer initialize and serve 2025-11-25 for goose, AND implement
 * server/discover plus modern per-request _meta handling for 2026-07-28
 * clients. The SDK cannot do this: @modelcontextprotocol/sdk 1.32.2 (latest,
 * verified 2026-10-29) tops out at 2025-11-25, so the modern surface is
 * implemented HERE, as a thin transport wrapper in front of the SDK server.
 *
 * Wire behavior (spec 2026-07-28, basic/transports/stdio#backward-compatibility):
 *  - server/discover           -> DiscoverResult (server is dual-era; we serve
 *                                 the legacy era, advertised truthfully).
 *  - request carrying
 *    params._meta["io.modelcontextprotocol/protocolVersion"] = X, X not served
 *                               -> UnsupportedProtocolVersionError, code -32022,
 *                                 data { requested, supported } (a RECOGNIZED
 *                                 modern error: marks the server as dual-era and
 *                                 tells the client exactly what to retry with).
 *  - everything else           -> passed through to the SDK (legacy path;
 *                                 initialize handshake enforced by the SDK).
 *
 * The shim answers BEFORE initialize and never touches tool dispatch — the
 * vault tool surface below it is unchanged.
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { SERVER_NAME, SERVER_VERSION } from './server';

/** Protocol versions this server actually serves (legacy era, via initialize). */
export const SUPPORTED_VERSIONS = ['2025-11-25'] as const;

/** The per-request version key used by modern-era (2026-07-28) clients. */
export const MODERN_META_KEY = 'io.modelcontextprotocol/protocolVersion';

/** JSON-RPC code for UnsupportedProtocolVersionError (2026-07-28 schema). */
export const UNSUPPORTED_PROTOCOL_VERSION = -32022;

type JsonRpcId = string | number;

interface JsonRpcRequestLike {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: { _meta?: Record<string, unknown> } & Record<string, unknown>;
}

function discoverResult(id: JsonRpcId): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      resultType: 'complete',
      supportedVersions: [...SUPPORTED_VERSIONS],
      capabilities: { tools: {}, resources: {} },
      _meta: {
        'io.modelcontextprotocol/serverInfo': { name: SERVER_NAME, version: SERVER_VERSION },
      },
      instructions:
        'Alfred vault MCP server. Dual-era: legacy initialize handshake at 2025-11-25; ' +
        'modern per-request _meta clients receive UnsupportedProtocolVersionError naming the served version.',
      ttlMs: 3_600_000,
      cacheScope: 'public',
    },
  } as unknown as JSONRPCMessage;
}

function unsupportedVersion(id: JsonRpcId, requested: string): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: UNSUPPORTED_PROTOCOL_VERSION,
      message: 'Unsupported protocol version: ' + requested,
      data: { requested, supported: [...SUPPORTED_VERSIONS] },
    },
  } as unknown as JSONRPCMessage;
}

/**
 * The interception decision, pure and separately testable.
 * Returns the response message when the shim handles the request itself,
 * or null when the request must pass through to the SDK.
 */
export function handleModernPrelude(msg: JsonRpcRequestLike): JSONRPCMessage | null {
  if (msg.id === undefined || typeof msg.method !== 'string') return null;
  if (msg.method === 'server/discover') return discoverResult(msg.id);
  const requested = msg.params?._meta?.[MODERN_META_KEY];
  if (typeof requested === 'string' && !(SUPPORTED_VERSIONS as readonly string[]).includes(requested)) {
    return unsupportedVersion(msg.id, requested);
  }
  return null;
}

/**
 * Wrap any MCP Transport so the dual-era prelude is answered in front of the
 * SDK server. Composition, not modification: the inner transport and the SDK's
 * legacy behavior are untouched.
 *
 * NOTE: the SDK's server sets onmessage on the WRAPPER (this object), while
 * inbound bytes surface on the INNER transport. start() therefore arms the
 * interception on the inner transport and dispatches to whatever handler the
 * SDK attached here — order-independent.
 */
class DualEraTransport implements Transport {
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(private readonly inner: Transport) {}

  async start(): Promise<void> {
    this.inner.onmessage = (message: JSONRPCMessage) => {
      const response = handleModernPrelude(message as unknown as JsonRpcRequestLike);
      if (response !== null) {
        void this.inner.send(response);
        return;
      }
      this.onmessage?.(message);
    };
    this.inner.onclose = () => this.onclose?.();
    this.inner.onerror = (e: Error) => this.onerror?.(e);
    return this.inner.start();
  }

  async close(): Promise<void> {
    return this.inner.close();
  }

  send(message: JSONRPCMessage): Promise<void> {
    return this.inner.send(message);
  }
}

export function wrapDualEra(inner: Transport): Transport {
  return new DualEraTransport(inner);
}
