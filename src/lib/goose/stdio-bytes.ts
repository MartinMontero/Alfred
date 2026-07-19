// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Normalize a Tauri shell stdout/stderr `data` payload into a real Uint8Array.
 *
 * The goose sidecar is spawned with `encoding: 'raw'`. Across the Tauri v2 IPC
 * boundary the raw bytes are serialized as a plain JSON number[], so what the
 * JS `data` handler actually receives is NOT a Uint8Array. Passing that array
 * straight to `TextDecoder.decode()` (or enqueuing it into a
 * ReadableStream<Uint8Array> that the ACP nd-json reader decodes) throws
 * "Failed to execute 'decode' on 'TextDecoder': parameter 1 is not of type
 * 'ArrayBuffer'" and kills the session on connect. Coerce every shape here.
 */
export function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  // Unknown shape — never hand a bad value to TextDecoder; emit nothing.
  return new Uint8Array();
}
