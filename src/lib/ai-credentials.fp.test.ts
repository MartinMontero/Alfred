// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * DIAGNOSTIC GATE — false-positive audit of resolveExcludedVendor.
 *
 * resolveExcludedVendor is defined in ./provider-policy and re-exported verbatim
 * from ./ai-credentials. Imported from the definition site to avoid pulling the
 * @platform side-effect into the test; it is the identical binding.
 *
 * Surface → field mapping (the real API is resolveExcludedVendor({provider?,
 * endpoint?, model?})): a host is screened as an endpoint URL; a provider id as
 * `provider`; a model id as `model`.
 */
import { describe, it, expect } from 'vitest';
import { resolveExcludedVendor, type ProviderIdentity } from './provider-policy';

type Surface = 'host' | 'provider' | 'model';
type Expect = 'BLOCKED' | 'ALLOWED' | 'PENDING';

interface Case {
  input: string;
  surface: Surface;
  expect: Expect;
}

function idFor(surface: Surface, input: string): ProviderIdentity {
  if (surface === 'host') return { endpoint: `https://${input}` };
  if (surface === 'provider') return { provider: input };
  return { model: input };
}

const CASES: Case[] = [
  // MUST STAY BLOCKED — exclusion must remain intact.
  { input: 'api.openai.com', surface: 'host', expect: 'BLOCKED' },
  { input: 'api.x.ai', surface: 'host', expect: 'BLOCKED' },
  { input: 'openai', surface: 'provider', expect: 'BLOCKED' },
  { input: 'azure_openai', surface: 'provider', expect: 'BLOCKED' },
  { input: 'chatgpt_codex', surface: 'provider', expect: 'BLOCKED' },
  { input: 'codex', surface: 'provider', expect: 'BLOCKED' },
  { input: 'codex-acp', surface: 'provider', expect: 'BLOCKED' },
  { input: 'xai', surface: 'provider', expect: 'BLOCKED' },
  { input: 'xai_oauth', surface: 'provider', expect: 'BLOCKED' },
  { input: 'gpt-4o', surface: 'model', expect: 'BLOCKED' },
  { input: 'o3', surface: 'model', expect: 'BLOCKED' },
  { input: 'grok-3', surface: 'model', expect: 'BLOCKED' },

  // MUST BE ALLOWED — legit non-excluded providers. Any BLOCKED is a false positive.
  { input: 'parallax.ai', surface: 'host', expect: 'ALLOWED' },
  { input: 'syntax.ai', surface: 'host', expect: 'ALLOWED' },
  { input: 'relax.ai', surface: 'host', expect: 'ALLOWED' },
  { input: 'max.airline.com', surface: 'host', expect: 'ALLOWED' },
  { input: 'openrouter.ai', surface: 'host', expect: 'ALLOWED' },
  { input: 'notmeta.com', surface: 'host', expect: 'ALLOWED' },
  { input: 'openrouter', surface: 'provider', expect: 'ALLOWED' },
  { input: 'mistral', surface: 'provider', expect: 'ALLOWED' },
  { input: 'ollama', surface: 'provider', expect: 'ALLOWED' },
  { input: 'groq', surface: 'provider', expect: 'ALLOWED' },
  { input: 'together', surface: 'provider', expect: 'ALLOWED' },
  { input: 'fireworks', surface: 'provider', expect: 'ALLOWED' },
  { input: 'deepseek', surface: 'provider', expect: 'ALLOWED' },
  { input: 'nano-gpt', surface: 'provider', expect: 'ALLOWED' },
  { input: 'gpt-neo', surface: 'model', expect: 'ALLOWED' },
  { input: 'gpt-j', surface: 'model', expect: 'ALLOWED' },
  { input: 'gpt-neox', surface: 'model', expect: 'ALLOWED' },
  { input: 'gpt4all', surface: 'model', expect: 'ALLOWED' },
  { input: 'tinyllama', surface: 'model', expect: 'ALLOWED' },
  { input: 'open-llama', surface: 'model', expect: 'ALLOWED' },
  { input: 'llamafile', surface: 'model', expect: 'ALLOWED' },
  { input: 'metamath', surface: 'model', expect: 'ALLOWED' },
  { input: 'armada-7b', surface: 'model', expect: 'ALLOWED' },
];

// POLICY: Llama weights on permitted infra are ALLOWED — Meta-the-vendor gets
// nothing in these requests. Asserted ALLOWED so a future re-added llama model
// rule fails CI here.
const LLAMA_ON_PERMITTED_INFRA: Array<{ label: string; provider: string; model: string }> = [
  { label: 'groq / llama-3.1-8b', provider: 'groq', model: 'llama-3.1-8b' },
  { label: 'together / meta-llama/Llama-3-70b', provider: 'together', model: 'meta-llama/Llama-3-70b' },
  { label: 'ollama(local) / llama3', provider: 'ollama', model: 'llama3' },
];

function resultOf(id: ProviderIdentity): { result: 'BLOCKED' | 'ALLOWED'; vendor: string } {
  const v = resolveExcludedVendor(id);
  return { result: v === null ? 'ALLOWED' : 'BLOCKED', vendor: v ?? '-' };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

describe('resolveExcludedVendor — false-positive diagnostic', () => {
  it('reports the full table and isolates false positives', () => {
    const rows: string[] = [];
    const header = `${pad('INPUT', 34)}${pad('SURFACE', 9)}${pad('RESULT', 16)}STATUS`;
    rows.push(header);
    rows.push('-'.repeat(header.length));

    const falsePositives: string[] = [];
    const brokenExclusions: string[] = [];

    for (const c of CASES) {
      const { result, vendor } = resultOf(idFor(c.surface, c.input));
      const resultStr = result === 'BLOCKED' ? `BLOCKED(${vendor})` : 'ALLOWED';
      let status: string;
      if (c.expect === 'BLOCKED') {
        const ok = result === 'BLOCKED';
        status = ok ? 'PASS' : 'FAIL (exclusion broken!)';
        if (!ok) brokenExclusions.push(`${c.input} [${c.surface}]`);
      } else {
        const ok = result === 'ALLOWED';
        status = ok ? 'PASS' : 'FAIL (false positive)';
        if (!ok) falsePositives.push(`${c.input} [${c.surface}] -> ${resultStr}`);
      }
      rows.push(`${pad(c.input, 34)}${pad(c.surface, 9)}${pad(resultStr, 16)}${status}`);
    }

    rows.push('');
    rows.push('LLAMA-ON-PERMITTED-INFRA (policy: ALLOWED — Meta-the-vendor gets nothing):');
    for (const p of LLAMA_ON_PERMITTED_INFRA) {
      const combined = resultOf({ provider: p.provider, model: p.model });
      const resultStr = combined.result === 'BLOCKED' ? `BLOCKED(${combined.vendor})` : 'ALLOWED';
      const ok = combined.result === 'ALLOWED';
      const status = ok ? 'PASS' : 'FAIL (false positive)';
      if (!ok) falsePositives.push(`${p.label} -> ${resultStr}`);
      rows.push(`${pad(p.label, 38)}${pad(resultStr, 16)}${status}`);
    }

    rows.push('');
    rows.push(`MUST-STAY-BLOCKED failures (exclusion broken): ${brokenExclusions.length}`);
    rows.push(`MUST-BE-ALLOWED false positives: ${falsePositives.length}`);
    for (const fp of falsePositives) rows.push(`  FP: ${fp}`);

    // Always print the full diagnostic table.
    console.log(`\n${rows.join('\n')}\n`);

    // Hard guarantee: exclusion of the three vendors must never regress.
    expect(brokenExclusions, 'MUST-STAY-BLOCKED rows must remain blocked').toEqual([]);

    // Diagnostic gate: surface the false positives by failing with the list.
    expect(falsePositives, 'MUST-BE-ALLOWED rows wrongly blocked (false positives)').toEqual([]);
  });
});
