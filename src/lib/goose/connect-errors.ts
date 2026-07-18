// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * F5 (beta.1 smoke): goose connection failures used to surface as raw
 * spawn/ACP error strings — a broken half-render instead of an honest
 * "not connected" state. Pure mapping, unit-tested; steward register
 * (first-person, plain, no error-code shouting), no wit in error copy.
 */

export interface GooseConnectFailure {
  /** Stable id for tests and styling decisions. */
  kind: 'sidecar-missing' | 'spawn-denied' | 'handshake' | 'key-missing' | 'no-vault' | 'unknown';
  /** Steward-register, user-facing. */
  message: string;
  /** Concrete next step, always present. */
  setupPath: string;
}

export function mapGooseConnectError(err: unknown): GooseConnectFailure {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();

  if (msg.includes('os error 2') || msg.includes('no such file') || msg.includes('not found') && (msg.includes('goose') || msg.includes('sidecar') || msg.includes('binar'))) {
    return {
      kind: 'sidecar-missing',
      message: "I couldn't find the goose engine in this build.",
      setupPath: 'Packaged Alfred ships the engine. In development, stage it first: npm run stage:goose.',
    };
  }
  if (msg.includes('permission denied') || msg.includes('os error 13') || msg.includes('access is denied')) {
    return {
      kind: 'spawn-denied',
      message: "The goose engine is present but the system refused to start it.",
      setupPath: 'Check antivirus or execution policy for the bundled goose executable, then reconnect.',
    };
  }
  if (msg.includes('initialize') || msg.includes('handshake') || msg.includes('timed out') || msg.includes('timeout')) {
    return {
      kind: 'handshake',
      message: 'goose started but never completed the handshake.',
      setupPath: "The engine's own message is in the session terminal below — that log names the cause.",
    };
  }
  if (msg.includes('api key') || msg.includes('unauthorized') || msg.includes('401')) {
    return {
      kind: 'key-missing',
      message: 'The provider rejected the connection — the API key is missing or not accepted.',
      setupPath: 'Enter a valid key for this provider, or switch to Ollama (local) which needs none.',
    };
  }
  return {
    kind: 'unknown',
    message: "I couldn't connect to goose.",
    setupPath: `Engine detail: ${raw}`,
  };
}

/**
 * Per-provider starting models for the connect form. Editable placeholders,
 * not assertions — the reset-on-provider-change is what fixes the observed
 * incoherence (Ollama paired with a Claude id). Denylist enforcement is
 * upstream (filterGooseProviderOptions + config lockdown) and untouched.
 */
export const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  google: 'gemini-2.5-pro',
  ollama: 'llama3',
  openrouter: '',
  mistral: 'mistral-large-latest',
};
