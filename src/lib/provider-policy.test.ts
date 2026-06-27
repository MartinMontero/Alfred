// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  checkProvider,
  checkProviderEndpoint,
  isProviderAllowed,
  assertProviderAllowed,
  assertProviderIdentityAllowed,
  resolveExcludedVendor,
  isLocalHost,
  ProviderNotAllowedError,
} from './provider-policy';

// The policy is a DENYLIST mirroring the platform exclusion engine: refuse only
// what resolves to Meta/OpenAI/xAI; permit everything else. The decisive proof
// is not "the three excluded vendors are refused" (necessary) but "a provider
// that is NOT Anthropic/Google and NOT excluded is ACCEPTED" — that is what
// distinguishes a denylist from the old, wrong allowlist of three.

describe('provider denylist — excluded vendors (Meta/OpenAI/xAI) are refused', () => {
  it('refuses OpenAI by endpoint and model', () => {
    const r = checkProviderEndpoint('https://api.openai.com/v1/chat/completions', 'gpt-4o');
    expect(r.allowed).toBe(false);
    expect(r.vendor).toBe('openai');
    expect(r.reason).toMatch(/OpenAI/);
  });

  it('refuses Azure OpenAI by endpoint', () => {
    expect(isProviderAllowed('https://my-resource.openai.azure.com/openai', 'gpt-4')).toBe(false);
  });

  it('refuses xAI by endpoint and Grok by model', () => {
    expect(isProviderAllowed('https://api.x.ai/v1', 'grok-2-latest')).toBe(false);
    expect(checkProvider({ model: 'grok-beta' }).vendor).toBe('xai');
  });

  it('refuses Meta the vendor by host, but allows Llama weights on permitted infra', () => {
    // Meta-the-vendor host stays blocked.
    expect(isProviderAllowed('https://www.llama-api.com/v1', 'llama-3.1-70b')).toBe(false);
    // Llama weights served by permitted infra (local Ollama) pay Meta nothing → allowed.
    expect(isProviderAllowed('http://localhost:11434/v1', 'llama3.2')).toBe(true);
    expect(isProviderAllowed('http://localhost:11434/v1', 'codellama')).toBe(true);
  });

  it('refuses an excluded model even via a permitted host (model id poisons the identity)', () => {
    expect(isProviderAllowed('https://api.anthropic.com/v1', 'gpt-4o')).toBe(false);
    expect(isProviderAllowed('https://api.anthropic.com/v1', 'o1-preview')).toBe(false);
    expect(isProviderAllowed('https://api.anthropic.com/v1', 'o3-mini')).toBe(false);
  });

  it('refuses an excluded model routed through a permitted aggregator (OpenRouter → OpenAI)', () => {
    // The HOST (openrouter.ai) is permitted, but the MODEL resolves to OpenAI.
    expect(isProviderAllowed('https://openrouter.ai/api/v1', 'openai/gpt-4o')).toBe(false);
    expect(checkProvider({ endpoint: 'https://openrouter.ai/api/v1', model: 'openai/o3-mini' }).vendor).toBe(
      'openai',
    );
  });

  it('refuses excluded vendors by provider name', () => {
    expect(resolveExcludedVendor({ provider: 'openai' })).toBe('openai');
    expect(resolveExcludedVendor({ provider: 'azure-openai' })).toBe('openai');
    expect(resolveExcludedVendor({ provider: 'xai' })).toBe('xai');
  });
});

describe('provider denylist — non-excluded providers/models are ACCEPTED (the load-bearing case)', () => {
  it('accepts Mistral — a provider that is neither Anthropic/Google nor excluded', () => {
    // This is the assertion that proves the allowlist→denylist fix.
    expect(isProviderAllowed('https://api.mistral.ai/v1/chat/completions', 'mistral-large-latest')).toBe(true);
    expect(resolveExcludedVendor({ provider: 'mistral', model: 'mistral-large-latest' })).toBeNull();
  });

  it('accepts an arbitrary local Ollama model (non-Meta)', () => {
    expect(isProviderAllowed('http://localhost:11434/v1', 'qwen2.5')).toBe(true);
    expect(isProviderAllowed('http://localhost:11434/v1', 'gemma2')).toBe(true);
    expect(isProviderAllowed('http://127.0.0.1:11434/v1', 'deepseek-r1')).toBe(true);
  });

  it('accepts OpenRouter routing an OPEN (non-excluded) model', () => {
    expect(isProviderAllowed('https://openrouter.ai/api/v1', 'mistralai/mistral-7b-instruct')).toBe(true);
    expect(isProviderAllowed('https://openrouter.ai/api/v1', 'qwen/qwen-2.5-72b-instruct')).toBe(true);
  });

  it('accepts other non-excluded hosted providers (Together, Groq, DeepSeek, Cohere, Fireworks)', () => {
    expect(isProviderAllowed('https://api.together.xyz/v1', 'Qwen/Qwen2.5-72B')).toBe(true);
    expect(isProviderAllowed('https://api.groq.com/openai/v1', 'mixtral-8x7b')).toBe(true);
    expect(isProviderAllowed('https://api.deepseek.com/v1', 'deepseek-chat')).toBe(true);
    expect(isProviderAllowed('https://api.cohere.com/v1', 'command-r-plus')).toBe(true);
    expect(isProviderAllowed('https://api.fireworks.ai/inference/v1', 'accounts/fireworks/llama')).toBe(true);
    expect(isProviderAllowed('https://api.fireworks.ai/inference/v1', 'accounts/fireworks/qwen2p5')).toBe(true);
  });

  it('still accepts the originally-permitted Anthropic, Google, and local self-hosted', () => {
    expect(isProviderAllowed('https://api.anthropic.com/v1/messages', 'claude-3-5-sonnet-latest')).toBe(true);
    expect(isProviderAllowed('https://generativelanguage.googleapis.com/v1beta', 'gemini-1.5-pro')).toBe(true);
    expect(isProviderAllowed('http://192.168.1.50:8000/v1', 'gemma-2')).toBe(true);
  });

  it('accepts EleutherAI open GPT-family models (gpt-j / gpt-neox) — not OpenAI', () => {
    // "gpt" alone must not trigger exclusion; only OpenAI's branded line does.
    expect(isProviderAllowed('https://api.together.xyz/v1', 'EleutherAI/gpt-j-6b')).toBe(true);
    expect(isProviderAllowed('https://api.together.xyz/v1', 'EleutherAI/gpt-neox-20b')).toBe(true);
  });

  it('accepts an endpoint with no model specified (host carries no exclusion signal)', () => {
    expect(isProviderAllowed('https://api.mistral.ai')).toBe(true);
  });
});

describe('resolveExcludedVendor', () => {
  it('returns null for permitted identities and the vendor tag for excluded ones', () => {
    expect(resolveExcludedVendor({ provider: 'ollama', model: 'qwen2.5' })).toBeNull();
    expect(resolveExcludedVendor({ provider: 'anthropic', model: 'claude-3-5-sonnet' })).toBeNull();
    expect(resolveExcludedVendor({ endpoint: 'https://api.openai.com/v1' })).toBe('openai');
    expect(resolveExcludedVendor({ model: 'gpt-5' })).toBe('openai');
    expect(resolveExcludedVendor({ model: 'grok-2' })).toBe('xai');
    expect(resolveExcludedVendor({ model: 'llama3.3' })).toBeNull();
  });
});

describe('assert helpers', () => {
  it('assertProviderAllowed does not throw for a permitted provider', () => {
    expect(() => assertProviderAllowed('https://api.mistral.ai/v1', 'mistral-large-latest')).not.toThrow();
  });

  it('assertProviderAllowed throws ProviderNotAllowedError for an excluded provider', () => {
    expect(() => assertProviderAllowed('https://api.openai.com/v1', 'gpt-4o')).toThrow(ProviderNotAllowedError);
  });

  it('assertProviderIdentityAllowed screens provider + endpoint + model together', () => {
    expect(() => assertProviderIdentityAllowed({ provider: 'mistral', endpoint: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' })).not.toThrow();
    expect(() => assertProviderIdentityAllowed({ provider: 'xai', endpoint: 'https://api.x.ai/v1', model: 'grok-2' })).toThrow(ProviderNotAllowedError);
  });
});

describe('isLocalHost (informational helper, no longer a gate)', () => {
  it.each(['localhost', '127.0.0.1', '::1', '0.0.0.0', '10.0.0.5', '192.168.1.2', '172.16.0.9', 'box.local'])(
    'treats %s as local',
    (host) => expect(isLocalHost(host)).toBe(true),
  );

  it.each(['api.openai.com', 'api.anthropic.com', '8.8.8.8', '172.32.0.1'])(
    'treats %s as non-local',
    (host) => expect(isLocalHost(host)).toBe(false),
  );
});
