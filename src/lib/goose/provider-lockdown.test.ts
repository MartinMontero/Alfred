// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import {
  gooseProviderVendor,
  isGooseProviderAllowed,
  assertGooseProviderAllowed,
  filterGooseProviderOptions,
  buildGooseEnv,
  buildGooseConfigYaml,
} from './provider-lockdown';
import { ProviderNotAllowedError } from '../provider-policy';

// The EXACT provider ids goose v1.39.0 advertises over ACP (session/new
// configOptions[provider].options), captured live. The excluded ones must be
// refused by Alfred; the permitted ones (the large majority) must pass.
const EXCLUDED_GOOSE_IDS = ['openai', 'azure_openai', 'chatgpt_codex', 'codex', 'codex-acp', 'xai', 'xai_oauth'];
const PERMITTED_GOOSE_IDS = [
  'anthropic',
  'google',
  'gemini_oauth',
  'gemini-cli',
  'ollama',
  'lmstudio',
  'local',
  'mistral',
  'openrouter',
  'groq',
  'together',
  'custom_deepseek',
  'huggingface',
  'nano-gpt', // third-party router — name contains "gpt" but does NOT resolve to OpenAI
  'opencode_go',
];

describe('goose provider lockdown — excluded vendors refused', () => {
  it.each(EXCLUDED_GOOSE_IDS)('refuses goose provider id "%s"', (id) => {
    expect(isGooseProviderAllowed(id)).toBe(false);
    expect(gooseProviderVendor(id)).not.toBeNull();
    expect(() => assertGooseProviderAllowed(id)).toThrow(ProviderNotAllowedError);
  });

  it('classifies the excluded ids to the right vendor', () => {
    expect(gooseProviderVendor('openai')).toBe('openai');
    expect(gooseProviderVendor('azure_openai')).toBe('openai');
    expect(gooseProviderVendor('chatgpt_codex')).toBe('openai');
    expect(gooseProviderVendor('codex')).toBe('openai');
    expect(gooseProviderVendor('xai')).toBe('xai');
    expect(gooseProviderVendor('xai_oauth')).toBe('xai');
  });
});

describe('goose provider lockdown — permitted providers accepted (the load-bearing case)', () => {
  it.each(PERMITTED_GOOSE_IDS)('accepts goose provider id "%s"', (id) => {
    expect(isGooseProviderAllowed(id)).toBe(true);
    expect(gooseProviderVendor(id)).toBeNull();
    expect(() => assertGooseProviderAllowed(id)).not.toThrow();
  });

  it('filters a goose-advertised provider list down to the permitted ones', () => {
    const advertised = [
      { value: 'anthropic', name: 'Anthropic' },
      { value: 'openai', name: 'OpenAI' },
      { value: 'mistral', name: 'Mistral AI' },
      { value: 'xai', name: 'xAI' },
      { value: 'ollama', name: 'Ollama' },
      { value: 'chatgpt_codex', name: 'ChatGPT Codex' },
    ];
    const kept = filterGooseProviderOptions(advertised).map((o) => o.value);
    expect(kept).toEqual(['anthropic', 'mistral', 'ollama']);
  });
});

describe('buildGooseEnv', () => {
  it('builds a locked-down env for a permitted provider, blanking ambient excluded keys', () => {
    const env = buildGooseEnv(
      { provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'sk-test' },
      { pathRoot: 'C:/alfred/goose' },
    );
    expect(env.GOOSE_DISABLE_KEYRING).toBe('1');
    expect(env.GOOSE_PROVIDER).toBe('anthropic');
    expect(env.GOOSE_MODEL).toBe('claude-sonnet-4-6');
    expect(env.GOOSE_PATH_ROOT).toBe('C:/alfred/goose');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
    // Ambient excluded-vendor keys are neutralized.
    expect(env.OPENAI_API_KEY).toBe('');
    expect(env.XAI_API_KEY).toBe('');
  });

  it('accepts a non-Anthropic/Google open provider (Mistral) and routes its key generically', () => {
    const env = buildGooseEnv({ provider: 'mistral', model: 'mistral-large-latest', apiKey: 'mk' });
    expect(env.GOOSE_PROVIDER).toBe('mistral');
    expect(env.GOOSE_PROVIDER__API_KEY).toBe('mk');
  });

  it('accepts a local Ollama model and sets OLLAMA_HOST', () => {
    const env = buildGooseEnv({ provider: 'ollama', model: 'qwen2.5', ollamaHost: 'http://localhost:11434' });
    expect(env.GOOSE_PROVIDER).toBe('ollama');
    expect(env.OLLAMA_HOST).toBe('http://localhost:11434');
  });

  it('refuses to build an env for an excluded provider', () => {
    expect(() => buildGooseEnv({ provider: 'openai', model: 'gpt-4o' })).toThrow(ProviderNotAllowedError);
    expect(() => buildGooseEnv({ provider: 'xai', model: 'grok-2' })).toThrow(ProviderNotAllowedError);
  });

  it('refuses an excluded model even on a permitted provider id', () => {
    expect(() => buildGooseEnv({ provider: 'ollama', model: 'gpt-4o' })).toThrow(ProviderNotAllowedError);
  });

  it('does not let `extra` re-introduce an excluded-vendor credential', () => {
    const env = buildGooseEnv(
      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      { extra: { OPENAI_API_KEY: 'leak', PATH: '/usr/bin' } },
    );
    expect(env.OPENAI_API_KEY).toBe('');
    expect(env.PATH).toBe('/usr/bin');
  });
});

describe('buildGooseConfigYaml', () => {
  it('emits a config that registers the vault MCP extension and pins a permitted provider', () => {
    const yaml = buildGooseConfigYaml({
      creds: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      vaultPath: 'C:/Users/u/Documents/Alfred',
      builtins: ['developer'],
    });
    expect(yaml).toContain('GOOSE_PROVIDER: "anthropic"');
    expect(yaml).toContain('alfred-vault:');
    expect(yaml).toContain('type: stdio');
    expect(yaml).toContain('developer:');
    expect(yaml).toContain('type: builtin');
    // No excluded vendor anywhere in the emitted config.
    expect(yaml.toLowerCase()).not.toMatch(/openai|xai|codex/);
  });

  it('refuses to emit a config for an excluded provider', () => {
    expect(() =>
      buildGooseConfigYaml({ creds: { provider: 'openai', model: 'gpt-4o' }, vaultPath: 'C:/v' }),
    ).toThrow(ProviderNotAllowedError);
  });
});
