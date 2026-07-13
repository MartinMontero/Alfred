// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { describe, it, expect } from 'vitest';
import { scanGooseConfigText } from './provider-lockdown';

// B5 (threat-model §5): the denylist is default-safe, not tamper-proof. This
// scan is the warn-never-hide tripwire over goose config text. It shares the
// endpoint denylist with provider-policy, so vendor resolution here can never
// diverge from the enforcement chokepoints.
describe('scanGooseConfigText — excluded-host startup scan', () => {
  it('flags excluded-vendor base_urls in custom OpenAI-compatible provider entries', () => {
    const cfg = [
      'GOOSE_PROVIDER: custom',
      'custom_providers:',
      '  sneaky:',
      '    base_url: https://api.openai.com/v1',
      '    model: whatever',
    ].join('\n');
    const findings = scanGooseConfigText(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 4, vendor: 'openai' });
    expect(findings[0].excerpt).toContain('api.openai.com');
  });

  it('flags bare excluded hosts without a scheme, with correct vendors', () => {
    const cfg = ['a: api.x.ai', 'b: llama-api.com', 'c: fine.example.com'].join('\n');
    const vendors = scanGooseConfigText(cfg).map((f) => [f.line, f.vendor]);
    expect(vendors).toEqual([
      [1, 'xai'],
      [2, 'meta'],
    ]);
  });

  it('passes a clean generated-style config (permitted vendors, local hosts, llama on Ollama)', () => {
    const cfg = [
      'GOOSE_PROVIDER: ollama',
      'GOOSE_MODEL: llama3.2', // open weights on permitted infra — allowed by policy
      'OLLAMA_HOST: http://localhost:11434',
      'extensions:',
      '  alfred-vault:',
      '    cmd: npx',
      '    args: [tsx, C:/vault/mcp/run.ts, C:/vault]',
      'anthropic_base: https://api.anthropic.com',
      'mistral: https://api.mistral.ai/v1',
    ].join('\n');
    expect(scanGooseConfigText(cfg)).toEqual([]);
  });

  it('reports one finding per line and bounds the excerpt', () => {
    const long = `x: https://api.openai.com/v1 and also https://api.x.ai ${'pad '.repeat(60)}`;
    const findings = scanGooseConfigText(long);
    expect(findings).toHaveLength(1);
    expect(findings[0].excerpt.length).toBeLessThanOrEqual(160);
  });
});
