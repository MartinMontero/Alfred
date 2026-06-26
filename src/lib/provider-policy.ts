// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Provider lockdown policy — the app-side vendor-exclusion chokepoint.
 *
 * Enforces CLAUDE.md constraint 2 for any AI provider the app talks to directly
 * (the BYOK "custom provider"): only **Anthropic + Google + local/self-hosted
 * (Ollama, LM Studio, vLLM)** endpoints are permitted; **Meta, OpenAI, and xAI**
 * endpoints and model ids are hard-refused (default-deny on unknown hosts).
 *
 * This module is pure and dependency-free so it is unit-testable in isolation and
 * can be enforced from any layer. The goose-side lockdown (a custom goose
 * distribution with providers stripped at compile time + env-var keys) lands in
 * Phase 4 — this only governs the in-app custom provider.
 */

export class ProviderNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderNotAllowedError';
  }
}

// Excluded vendors (Meta / OpenAI / xAI) — endpoint host fragments.
const EXCLUDED_HOST_SIGNALS = [
  'openai.com',
  'openai.azure.com',
  'oai.azure.com',
  'x.ai',
  'meta.com',
  'meta.ai',
  'llama.meta',
  'llama-api.com',
];

// Excluded model-id fragments — proprietary models of the excluded vendors.
const EXCLUDED_MODEL_SIGNALS = [
  'gpt',
  'chatgpt',
  'davinci',
  'openai',
  'grok',
  'xai',
  'llama', // Meta — refused even on a local endpoint (no Meta weights either).
  'codellama',
];

// Permitted hosted vendors (Anthropic + Google).
const PERMITTED_HOST_SIGNALS = ['anthropic.com', 'googleapis.com', 'google.com'];

/** True for localhost / loopback / private-network / .local hosts (self-hosted). */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  if (h === 'host.docker.internal' || h.endsWith('.local') || h.endsWith('.localhost')) return true;
  // Private IPv4 ranges (RFC 1918) — self-hosted Ollama/LM Studio/vLLM.
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  return false;
}

export interface ProviderCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check a provider endpoint URL (and optional model id) against the allowlist.
 * Default-deny: an endpoint that is neither permitted nor local is refused.
 */
export function checkProviderEndpoint(endpoint: string, model?: string): ProviderCheckResult {
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return { allowed: false, reason: `Invalid provider endpoint URL: "${endpoint}".` };
  }

  for (const sig of EXCLUDED_HOST_SIGNALS) {
    if (host.includes(sig)) {
      return {
        allowed: false,
        reason: `Endpoint host "${host}" belongs to an excluded vendor (Meta/OpenAI/xAI). Permitted: Anthropic, Google, or a local endpoint.`,
      };
    }
  }

  if (model) {
    const m = model.toLowerCase();
    for (const sig of EXCLUDED_MODEL_SIGNALS) {
      if (m.includes(sig)) {
        return { allowed: false, reason: `Model "${model}" is an excluded-vendor (Meta/OpenAI/xAI) model.` };
      }
    }
    // OpenAI o-series (o1/o3/o4, incl. -mini/-preview).
    if (/^o[134](-|$)/.test(m)) {
      return { allowed: false, reason: `Model "${model}" is an OpenAI model and is excluded.` };
    }
  }

  const permitted = isLocalHost(host) || PERMITTED_HOST_SIGNALS.some((s) => host.includes(s));
  if (!permitted) {
    return {
      allowed: false,
      reason: `Endpoint host "${host}" is not on the provider allowlist (Anthropic, Google, or local).`,
    };
  }

  return { allowed: true };
}

/** True iff the endpoint (and optional model) is permitted. */
export function isProviderAllowed(endpoint: string, model?: string): boolean {
  return checkProviderEndpoint(endpoint, model).allowed;
}

/** Throws ProviderNotAllowedError if the endpoint/model is not permitted. */
export function assertProviderAllowed(endpoint: string, model?: string): void {
  const result = checkProviderEndpoint(endpoint, model);
  if (!result.allowed) {
    throw new ProviderNotAllowedError(result.reason ?? 'Provider not allowed.');
  }
}
