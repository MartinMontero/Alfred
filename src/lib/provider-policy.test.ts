// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  checkProviderEndpoint,
  isProviderAllowed,
  assertProviderAllowed,
  isLocalHost,
  ProviderNotAllowedError,
} from './provider-policy';

describe('provider lockdown — permitted providers', () => {
  it('allows Anthropic', () => {
    expect(isProviderAllowed('https://api.anthropic.com/v1/messages', 'claude-3-5-sonnet-latest')).toBe(true);
  });

  it('allows Google (Gemini)', () => {
    expect(isProviderAllowed('https://generativelanguage.googleapis.com/v1beta', 'gemini-1.5-pro')).toBe(true);
  });

  it('allows local Ollama (localhost)', () => {
    expect(isProviderAllowed('http://localhost:11434/v1', 'qwen2.5')).toBe(true);
  });

  it('allows local LM Studio (127.0.0.1)', () => {
    expect(isProviderAllowed('http://127.0.0.1:1234/v1', 'mistral-7b')).toBe(true);
  });

  it('allows a private-network self-hosted endpoint', () => {
    expect(isProviderAllowed('http://192.168.1.50:8000/v1', 'gemma-2')).toBe(true);
  });

  it('allows endpoint with no model specified (host-only check)', () => {
    expect(isProviderAllowed('https://api.anthropic.com')).toBe(true);
  });
});

describe('provider lockdown — excluded vendors are hard-refused', () => {
  it('refuses OpenAI by endpoint', () => {
    const r = checkProviderEndpoint('https://api.openai.com/v1/chat/completions', 'gpt-4o');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/excluded vendor/i);
  });

  it('refuses xAI by endpoint', () => {
    expect(isProviderAllowed('https://api.x.ai/v1', 'grok-2-latest')).toBe(false);
  });

  it('refuses Azure OpenAI by endpoint', () => {
    expect(isProviderAllowed('https://my-resource.openai.azure.com/openai', 'gpt-4')).toBe(false);
  });

  it('refuses a Meta endpoint', () => {
    expect(isProviderAllowed('https://www.llama-api.com/v1', 'llama-3.1-70b')).toBe(false);
  });

  it('refuses an OpenAI model id even via a permitted host', () => {
    expect(isProviderAllowed('https://api.anthropic.com/v1', 'gpt-4o')).toBe(false);
  });

  it('refuses an OpenAI o-series model id', () => {
    expect(isProviderAllowed('https://api.anthropic.com/v1', 'o1-preview')).toBe(false);
    expect(isProviderAllowed('https://api.anthropic.com/v1', 'o3-mini')).toBe(false);
  });

  it('refuses a Meta llama model id even on a local endpoint', () => {
    expect(isProviderAllowed('http://localhost:11434/v1', 'llama3.2')).toBe(false);
    expect(isProviderAllowed('http://localhost:11434/v1', 'codellama')).toBe(false);
  });

  it('refuses a grok model id', () => {
    expect(isProviderAllowed('https://api.anthropic.com/v1', 'grok-beta')).toBe(false);
  });
});

describe('provider lockdown — default-deny unknown hosts', () => {
  it('refuses an unknown third-party aggregator (not on the allowlist)', () => {
    expect(isProviderAllowed('https://openrouter.ai/api/v1', 'claude-3-5-sonnet')).toBe(false);
  });

  it('refuses an invalid endpoint URL', () => {
    expect(isProviderAllowed('not-a-url', 'claude-3-5-sonnet')).toBe(false);
  });
});

describe('assertProviderAllowed', () => {
  it('does not throw for a permitted provider', () => {
    expect(() => assertProviderAllowed('https://api.anthropic.com/v1', 'claude-3-5-sonnet')).not.toThrow();
  });

  it('throws ProviderNotAllowedError for an excluded provider', () => {
    expect(() => assertProviderAllowed('https://api.openai.com/v1', 'gpt-4o')).toThrow(ProviderNotAllowedError);
  });
});

describe('isLocalHost', () => {
  it.each(['localhost', '127.0.0.1', '::1', '0.0.0.0', '10.0.0.5', '192.168.1.2', '172.16.0.9', 'box.local'])(
    'treats %s as local',
    (host) => expect(isLocalHost(host)).toBe(true),
  );

  it.each(['api.openai.com', 'api.anthropic.com', '8.8.8.8', '172.32.0.1'])(
    'treats %s as non-local',
    (host) => expect(isLocalHost(host)).toBe(false),
  );
});
