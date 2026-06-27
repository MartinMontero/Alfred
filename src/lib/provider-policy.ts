// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Provider lockdown policy — the app-side vendor-exclusion chokepoint.
 *
 * Enforces CLAUDE.md constraint 2 as a **denylist**, mirroring the platform's
 * exclusion engine: refuse only what resolves to an **excluded vendor — Meta,
 * OpenAI, or xAI** — and **permit every other provider/model**. Anthropic,
 * Google, Mistral, DeepSeek, Qwen, Gemma, Cohere, any open-weights provider,
 * OpenRouter-routed open models, and local/self-hosted (Ollama, LM Studio,
 * vLLM) are all permitted, because none of them resolve to an excluded vendor.
 *
 * This is **not** an allowlist of three. The enforcement point is vendor
 * identity: a provider name, endpoint host, or model id is refused only when it
 * resolves to Meta/OpenAI/xAI. Note that Meta's Llama models (llama, codellama)
 * resolve to Meta the vendor and are therefore excluded, even on a local
 * endpoint; but the local endpoint itself, running any non-excluded model, is
 * fine. A model routed through a permitted aggregator (e.g. OpenRouter) that
 * still resolves to an excluded vendor (e.g. `openai/gpt-4o`) is refused on the
 * model id even though the host is permitted.
 *
 * This module is pure and dependency-free so it is unit-testable in isolation and
 * can be enforced from any layer. The goose-side lockdown (Phase 4) routes
 * goose's provider/credential setup through this same denylist so an excluded
 * vendor cannot be configured or passed through Alfred.
 */

export class ProviderNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderNotAllowedError';
  }
}

/** The three excluded vendors (CLAUDE.md constraint 2). Nothing else is excluded. */
export type ExcludedVendor = 'meta' | 'openai' | 'xai';

/** A provider identity to screen. Any combination of fields may be supplied. */
export interface ProviderIdentity {
  /** Provider name/id, e.g. "openai", "anthropic", "mistral", "ollama", "xai". */
  provider?: string;
  /** Provider base URL / endpoint, e.g. "https://api.mistral.ai/v1". */
  endpoint?: string;
  /** Model id, e.g. "gpt-4o", "claude-3-5-sonnet", "mistral-large-latest". */
  model?: string;
}

// --- Excluded-vendor signal tables (the denylist) ---------------------------
// Each table maps a signal to one of the three excluded vendors. Anything that
// matches none of these is permitted.

// Provider-name tokens (normalized: lowercased, separators stripped).
const OPENAI_PROVIDER_TOKENS = ['openai', 'azureopenai', 'codex'];
const XAI_PROVIDER_TOKENS = ['xai', 'grok'];
const META_PROVIDER_TOKENS = ['metaai', 'metallama'];

// Endpoint host suffixes (matched as exact host or `*.suffix`, never substring,
// so "max.airline.com" can never match "x.ai").
const OPENAI_HOSTS = ['openai.com', 'openai.azure.com', 'oai.azure.com'];
const XAI_HOSTS = ['x.ai'];
const META_HOSTS = ['meta.com', 'meta.ai', 'llama.meta.com', 'llama-api.com', 'llamaapi.com'];

/** Normalize a provider name for token matching. */
function normalizeProvider(provider: string): string {
  return provider.toLowerCase().replace(/[\s._/-]/g, '');
}

/** True when `host` is exactly `suffix` or a subdomain of it. */
function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/** Resolve a model id to an excluded vendor, or null if it is not excluded. */
function modelVendor(model: string): ExcludedVendor | null {
  const m = model.toLowerCase();

  // OpenAI: branded product line, not generic "gpt" (EleutherAI's gpt-j /
  // gpt-neox are open and permitted). Also catches OpenAI ids routed through an
  // aggregator (e.g. "openai/o1-preview").
  if (
    m.includes('openai') ||
    m.includes('chatgpt') ||
    m.includes('davinci') ||
    m.includes('codex') ||
    /(^|[^a-z0-9])gpt-(3|4|5|oss|image|audio|realtime)/.test(m) ||
    /^o[1-4](-|$)/.test(m)
  ) {
    return 'openai';
  }

  // xAI: Grok.
  if (m.includes('grok') || /(^|[^a-z])xai(\b|[^a-z])/.test(m)) return 'xai';

  // No Meta model-id rule: Meta has no first-party hosted chat model, and Llama
  // weights served by permitted infra (Ollama/Groq/Together/…) pay Meta-the-vendor
  // nothing. Meta-the-vendor stays excluded via META_HOSTS + META_PROVIDER_TOKENS.
  return null;
}

/** Resolve an endpoint host to an excluded vendor, or null. Returns null for an
 * unparseable URL (host carries no exclusion signal; the caller decides). */
function endpointVendor(endpoint: string): ExcludedVendor | null {
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (OPENAI_HOSTS.some((h) => hostMatches(host, h))) return 'openai';
  if (XAI_HOSTS.some((h) => hostMatches(host, h))) return 'xai';
  if (META_HOSTS.some((h) => hostMatches(host, h))) return 'meta';
  return null;
}

/** Resolve a provider name to an excluded vendor, or null. */
function providerVendor(provider: string): ExcludedVendor | null {
  const p = normalizeProvider(provider);
  if (OPENAI_PROVIDER_TOKENS.some((t) => p.includes(t))) return 'openai';
  if (XAI_PROVIDER_TOKENS.some((t) => p.includes(t))) return 'xai';
  if (META_PROVIDER_TOKENS.some((t) => p.includes(t))) return 'meta';
  return null;
}

/**
 * Resolve a provider identity to an excluded vendor (Meta/OpenAI/xAI), or null
 * if it resolves to no excluded vendor (and is therefore **permitted**).
 *
 * This is the single source of truth for the denylist. Any field that resolves
 * to an excluded vendor poisons the whole identity (e.g. an OpenAI model on an
 * otherwise-permitted host is still refused).
 */
export function resolveExcludedVendor(id: ProviderIdentity): ExcludedVendor | null {
  return (
    (id.provider ? providerVendor(id.provider) : null) ??
    (id.endpoint ? endpointVendor(id.endpoint) : null) ??
    (id.model ? modelVendor(id.model) : null)
  );
}

/** True for localhost / loopback / private-network / .local hosts.
 *
 * Informational only — under the denylist, locality does **not** affect the
 * allow decision (a non-excluded model on any host is permitted). Provided for
 * privacy/diagnostics UI (e.g. labelling a local, fully-offline model). */
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
  /** The excluded vendor that caused a refusal, if any. */
  vendor?: ExcludedVendor;
  reason?: string;
}

const VENDOR_LABEL: Record<ExcludedVendor, string> = {
  meta: 'Meta',
  openai: 'OpenAI',
  xai: 'xAI',
};

/**
 * Check a full provider identity against the denylist. Permits everything that
 * does not resolve to Meta/OpenAI/xAI.
 */
export function checkProvider(id: ProviderIdentity): ProviderCheckResult {
  const vendor = resolveExcludedVendor(id);
  if (vendor === null) return { allowed: true };
  const what =
    id.model && modelVendor(id.model) === vendor
      ? `Model "${id.model}"`
      : id.endpoint && endpointVendor(id.endpoint) === vendor
        ? `Endpoint "${id.endpoint}"`
        : `Provider "${id.provider}"`;
  return {
    allowed: false,
    vendor,
    reason: `${what} resolves to the excluded vendor ${VENDOR_LABEL[vendor]}. Alfred excludes only Meta, OpenAI, and xAI; every other provider/model is permitted.`,
  };
}

/**
 * Check a provider endpoint URL (and optional model id) against the denylist.
 * Back-compatible signature for the platform AI adapter; delegates to
 * {@link checkProvider}. Permits any endpoint/model that is not excluded.
 */
export function checkProviderEndpoint(endpoint: string, model?: string): ProviderCheckResult {
  return checkProvider({ endpoint, model });
}

/** True iff the endpoint (and optional model) is permitted. */
export function isProviderAllowed(endpoint: string, model?: string): boolean {
  return checkProviderEndpoint(endpoint, model).allowed;
}

/** Throws ProviderNotAllowedError if the endpoint/model resolves to an excluded vendor. */
export function assertProviderAllowed(endpoint: string, model?: string): void {
  const result = checkProviderEndpoint(endpoint, model);
  if (!result.allowed) {
    throw new ProviderNotAllowedError(result.reason ?? 'Provider not allowed.');
  }
}

/** Throws ProviderNotAllowedError if a full provider identity is excluded. */
export function assertProviderIdentityAllowed(id: ProviderIdentity): void {
  const result = checkProvider(id);
  if (!result.allowed) {
    throw new ProviderNotAllowedError(result.reason ?? 'Provider not allowed.');
  }
}
