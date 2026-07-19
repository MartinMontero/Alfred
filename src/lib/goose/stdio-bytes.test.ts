// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Red-first: this encodes the exact connect-time failure Martin hit on the
 * installed sixth cut — the Tauri raw-encoding stdout arrives as a number[],
 * and TextDecoder.decode() on it throws. toUint8Array must make the decode work.
 */
import { describe, expect, it } from 'vitest';
import { toUint8Array } from './stdio-bytes';

const HELLO = [72, 105]; // "Hi"

describe('toUint8Array', () => {
  it('demonstrates the raw bug: decoding a number[] directly throws', () => {
    // This is what the old code effectively did with the Tauri payload.
    expect(() => new TextDecoder().decode(HELLO as unknown as ArrayBuffer)).toThrow();
  });

  it('rebuilds a Uint8Array from the number[] the IPC delivers, so decode works', () => {
    const u8 = toUint8Array(HELLO);
    expect(u8).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(u8)).toBe('Hi');
  });

  it('passes a real Uint8Array through unchanged (identity)', () => {
    const src = new Uint8Array(HELLO);
    expect(toUint8Array(src)).toBe(src);
  });

  it('wraps an ArrayBuffer', () => {
    const buf = new Uint8Array(HELLO).buffer;
    expect(new TextDecoder().decode(toUint8Array(buf))).toBe('Hi');
  });

  it('handles a typed-array view honoring its offset', () => {
    const backing = new Uint8Array([0, 0, 72, 105]);
    const view = new Uint8Array(backing.buffer, 2, 2);
    expect(new TextDecoder().decode(toUint8Array(view))).toBe('Hi');
  });

  it('an unknown shape yields empty bytes, never a throw', () => {
    expect(toUint8Array(null).length).toBe(0);
    expect(toUint8Array(undefined).length).toBe(0);
  });
});
