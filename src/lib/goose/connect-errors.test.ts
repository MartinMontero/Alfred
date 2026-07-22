// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { mapGooseConnectError, PROVIDER_DEFAULT_MODEL } from './connect-errors';

describe('F5 — goose connect failures map to honest, actionable states', () => {
  it('missing sidecar names the dev setup path', () => {
    const f = mapGooseConnectError(new Error('failed to spawn goose: No such file or directory (os error 2)'));
    expect(f.kind).toBe('sidecar-missing');
    expect(f.setupPath).toContain('stage:goose');
  });
  it('handshake failures point at the session terminal', () => {
    expect(mapGooseConnectError(new Error('initialize timed out after 30s')).kind).toBe('handshake');
  });
  it('auth failures name the key, not a stack trace', () => {
    const f = mapGooseConnectError(new Error('401 unauthorized'));
    expect(f.kind).toBe('key-missing');
    expect(f.message).not.toMatch(/401/);
  });
  it('unknown errors keep the raw detail visible — never swallowed', () => {
    const f = mapGooseConnectError(new Error('weird wire state'));
    expect(f.kind).toBe('unknown');
    expect(f.setupPath).toContain('weird wire state');
  });
});

describe('F5 — provider/model coherence', () => {
  // The guard-permitted roster (holmes-guard PERMITTED_PROVIDERS, ADR-0008).
  it('every guard-permitted provider has a starting-model entry', () => {
    for (const p of ['anthropic', 'google', 'deepseek', 'qwen', 'mistral', 'ollama']) {
      expect(PROVIDER_DEFAULT_MODEL).toHaveProperty(p);
    }
  });
  it('no default model pairs a local provider with a Claude id', () => {
    expect(PROVIDER_DEFAULT_MODEL.ollama).not.toMatch(/claude/i);
  });
  it('the ollama default is a guard-permitted family (never llama, dropped on the agentic surface)', () => {
    // ADR-0008 narrowing: llama-family ids deny everywhere on the agentic
    // surface; the picker must not start on one.
    expect(PROVIDER_DEFAULT_MODEL.ollama).not.toMatch(/llama/i);
  });
});
