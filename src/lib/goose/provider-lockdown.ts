// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * goose provider lockdown — the goose-side half of the vendor-exclusion denylist.
 *
 * goose v1.39.0 compiles **all** providers into the binary (there are no
 * per-provider Cargo features; the providers are even enumerable over ACP in the
 * `session/new` response `configOptions`). So no config can *remove* OpenAI/xAI
 * from the binary — config can only *default away* from them and withhold
 * credentials. Alfred therefore makes the excluded vendors **unreachable through
 * Alfred** by:
 *
 *   1. spawning `goose acp` with a controlled env — `GOOSE_PROVIDER` pinned to a
 *      permitted provider, `GOOSE_DISABLE_KEYRING=1`, only the permitted key, and
 *      ambient excluded-vendor keys blanked (defense in depth);
 *   2. isolating goose under `GOOSE_PATH_ROOT` so Alfred never reads or writes the
 *      user's shared `%APPDATA%\Block\goose` config;
 *   3. routing every provider/credential decision through the **same denylist** as
 *      the app side ([resolveExcludedVendor] in ../provider-policy) — so an
 *      excluded vendor can neither be configured nor passed through Alfred; and
 *   4. filtering the ACP-advertised provider list so the UI never offers an
 *      excluded vendor.
 *
 * The binary still *contains* the excluded providers' code (no fork — AAIF /
 * Linux Foundation provenance is accepted). This module is the chokepoint that
 * keeps them unreachable in practice. See docs/audit/phase4.md.
 */

import {
  resolveExcludedVendor,
  checkProviderEndpoint,
  ProviderNotAllowedError,
  type ExcludedVendor,
} from '../provider-policy';

/** One excluded-vendor hit found while scanning goose config text (B5). */
export interface ConfigScanFinding {
  /** 1-indexed line number in the scanned text. */
  line: number;
  /** Trimmed line content (bounded) for display — never logged elsewhere. */
  excerpt: string;
  vendor: ExcludedVendor;
}

/**
 * Startup scan of goose config text for excluded-vendor hosts (threat-model §5).
 * Warn-only by design: the denylist is default-safe, not tamper-proof — a user
 * can hand-edit the isolated config between sessions, and goose accepts custom
 * OpenAI-compatible providers with arbitrary base_url. Alfred surfaces what it
 * finds and never silently rewrites; it also runs this over its OWN generated
 * config as a writer-regression tripwire. URL and bare-host candidates are both
 * screened through the shared endpoint denylist so this can never diverge from
 * the policy module.
 */
export function scanGooseConfigText(text: string): ConfigScanFinding[] {
  const findings: ConfigScanFinding[] = [];
  const urlRe = /https?:\/\/[^\s"'#]+/gi;
  const hostRe = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const candidates = new Set<string>();
    for (const m of raw.matchAll(urlRe)) candidates.add(m[0]);
    for (const m of raw.matchAll(hostRe)) candidates.add(`https://${m[0]}`);
    for (const candidate of candidates) {
      const res = checkProviderEndpoint(candidate);
      if (!res.allowed && res.vendor) {
        findings.push({ line: i + 1, excerpt: raw.trim().slice(0, 160), vendor: res.vendor });
        break; // one finding per line is enough to warn
      }
    }
  }
  return findings;
}

/** A provider option as advertised by goose over ACP (`configOptions[provider].options`). */
export interface GooseProviderOption {
  value: string;
  name: string;
}

/**
 * Resolve a goose provider id (e.g. "openai", "azure_openai", "chatgpt_codex",
 * "xai", "xai_oauth", "anthropic", "google", "ollama", "mistral") to an excluded
 * vendor, or null if it is permitted. Delegates to the shared denylist so the app
 * side and goose side can never diverge.
 */
export function gooseProviderVendor(providerId: string): ExcludedVendor | null {
  return resolveExcludedVendor({ provider: providerId });
}

/** True iff the goose provider id does not resolve to an excluded vendor. */
export function isGooseProviderAllowed(providerId: string): boolean {
  return gooseProviderVendor(providerId) === null;
}

/** Throws ProviderNotAllowedError if the goose provider id is an excluded vendor. */
export function assertGooseProviderAllowed(providerId: string): void {
  const vendor = gooseProviderVendor(providerId);
  if (vendor !== null) {
    throw new ProviderNotAllowedError(
      `goose provider "${providerId}" resolves to the excluded vendor ${vendor}. ` +
        `Alfred excludes only Meta, OpenAI, and xAI; every other goose provider is permitted.`,
    );
  }
}

/** Filter a goose-advertised provider list down to the permitted (non-excluded) ones. */
export function filterGooseProviderOptions(options: GooseProviderOption[]): GooseProviderOption[] {
  return options.filter((o) => isGooseProviderAllowed(o.value));
}

// Provider-specific API-key env var names (goose reads these directly). Anything
// not listed falls back to goose's generic GOOSE_PROVIDER__API_KEY.
const PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
};

// Ambient excluded-vendor credential env vars to blank out in the child env, so a
// key in the user's shell can never reach goose even if a provider were switched.
const NEUTRALIZE_EXCLUDED_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_ORG_ID',
  'OPENAI_ORGANIZATION',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'XAI_API_KEY',
  'GROK_API_KEY',
  'CODEX_API_KEY',
];

export interface GooseProviderCreds {
  /** A permitted goose provider id (refused if it resolves to Meta/OpenAI/xAI). */
  provider: string;
  /** The model id (refused if it resolves to an excluded vendor, e.g. a Llama/GPT/Grok id). */
  model: string;
  /** API key for a hosted provider — passed via env only, never persisted by goose. */
  apiKey?: string;
  /** Ollama host for the local provider (e.g. http://localhost:11434). */
  ollamaHost?: string;
}

export interface GooseEnvOptions {
  /** Isolated goose root so Alfred never touches the user's shared goose config. */
  pathRoot?: string;
  /** Extra env to merge last (e.g. PATH tweaks). Excluded keys are still blanked. */
  extra?: Record<string, string>;
  /** OPT-IN OTLP export of goose's own spans to a local/external collector. When
   *  omitted (the default), goose's OTel is disabled — local-first, no external
   *  dependency. When set, goose exports spans that can join the session trace. */
  otelEndpoint?: string;
}

/**
 * Build the environment for spawning `goose acp`. Refuses outright if the provider
 * or model resolves to an excluded vendor — so Alfred cannot launch goose against
 * Meta/OpenAI/xAI. Keys are passed via env (never written to goose's plaintext
 * secrets store), and ambient excluded-vendor keys are blanked.
 */
export function buildGooseEnv(creds: GooseProviderCreds, options: GooseEnvOptions = {}): Record<string, string> {
  assertGooseProviderAllowed(creds.provider);
  const modelVendor = resolveExcludedVendor({ model: creds.model });
  if (modelVendor !== null) {
    throw new ProviderNotAllowedError(
      `goose model "${creds.model}" resolves to the excluded vendor ${modelVendor} and cannot be used.`,
    );
  }

  const env: Record<string, string> = {
    GOOSE_DISABLE_KEYRING: '1',
    GOOSE_PROVIDER: creds.provider,
    GOOSE_MODEL: creds.model,
    // Force goose's own telemetry off — Alfred owns telemetry, opt-in + local-only.
    GOOSE_TELEMETRY_ENABLED: 'false',
  };
  if (options.pathRoot) env.GOOSE_PATH_ROOT = options.pathRoot;

  // Local-first default: goose's own OTel is OFF unless the builder opts in with a
  // collector endpoint. Opt-in joins goose's spans to the session trace; default
  // never attempts external export.
  if (options.otelEndpoint) {
    env.OTEL_SDK_DISABLED = 'false';
    env.OTEL_EXPORTER_OTLP_ENDPOINT = options.otelEndpoint;
    env.OTEL_SERVICE_NAME = 'alfred-goose';
  } else {
    env.OTEL_SDK_DISABLED = 'true';
  }

  if (creds.apiKey) {
    const keyVar = PROVIDER_KEY_ENV[creds.provider] ?? 'GOOSE_PROVIDER__API_KEY';
    env[keyVar] = creds.apiKey;
  }
  if (creds.provider === 'ollama' && creds.ollamaHost) {
    env.OLLAMA_HOST = creds.ollamaHost;
  }

  // Defense in depth: blank any ambient excluded-vendor credentials.
  for (const k of NEUTRALIZE_EXCLUDED_KEYS) env[k] = '';

  if (options.extra) {
    for (const [k, v] of Object.entries(options.extra)) {
      // Never let `extra` re-introduce an excluded-vendor credential.
      if (NEUTRALIZE_EXCLUDED_KEYS.includes(k)) continue;
      env[k] = v;
    }
  }
  return env;
}

export interface GooseConfigOptions {
  creds: GooseProviderCreds;
  /** Absolute path to the vault root the MCP server should serve. */
  vaultPath: string;
  /** Command goose runs to start the Alfred MCP server (default: npx). */
  mcpCommand?: string;
  /** Args for the MCP command (default: tsx <mcpEntry> <vaultPath>). */
  mcpArgs?: string[];
  /** Extra builtin/stdio extensions to enable by name (e.g. subagent support). */
  builtins?: string[];
}

/**
 * Build the Alfred custom-distribution `config.yaml` (written under GOOSE_PATH_ROOT).
 * Preconfigures only the permitted provider/model and registers the Alfred vault
 * MCP server as a `type: stdio` extension so goose reads the vault as ground truth
 * by default. Refuses to emit a config for an excluded provider/model.
 *
 * Emitted by hand (no YAML dependency) to keep the supply chain minimal; values
 * are JSON-quoted, which is valid YAML.
 */
export function buildGooseConfigYaml(opts: GooseConfigOptions): string {
  assertGooseProviderAllowed(opts.creds.provider);
  if (resolveExcludedVendor({ model: opts.creds.model }) !== null) {
    throw new ProviderNotAllowedError(
      `Refusing to write a goose config for excluded model "${opts.creds.model}".`,
    );
  }
  const cmd = opts.mcpCommand ?? 'npx';
  const args = opts.mcpArgs ?? ['tsx', `${opts.vaultPath.replace(/\\/g, '/')}/mcp/run.ts`, opts.vaultPath];
  const q = (s: string) => JSON.stringify(s);

  const lines: string[] = [
    '# Alfred custom goose distribution — only non-excluded providers are configured.',
    '# Generated by Alfred; do not edit by hand. Keys are passed via env, never stored here.',
    `GOOSE_PROVIDER: ${q(opts.creds.provider)}`,
    `GOOSE_MODEL: ${q(opts.creds.model)}`,
    'extensions:',
    '  alfred-vault:',
    '    type: stdio',
    `    cmd: ${q(cmd)}`,
    '    args:',
    ...args.map((a) => `      - ${q(a)}`),
    '    enabled: true',
    '    timeout: 300',
  ];

  // Optional builtin extensions (e.g. the subagent/summon builtin) — enabled so
  // goose can spawn subagents for parallel work while keeping the main context clean.
  for (const name of opts.builtins ?? []) {
    lines.push(
      `  ${name}:`,
      '    type: builtin',
      `    name: ${q(name)}`,
      '    enabled: true',
      '    timeout: 300',
    );
  }
  return `${lines.join('\n')}\n`;
}
