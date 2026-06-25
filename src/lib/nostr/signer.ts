// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Nostr Signer Abstraction
 *
 * Provides a unified interface for signing Nostr events, supporting:
 * - Local signing with nsec
 *
 * Built on nostr-tools (Unlicense) + the audited @noble crypto it uses
 * internally. Replaces the former vendor-excluded `NSecSigner` (removed
 * wholesale under the vendor-exclusion policy); it only provided the signer
 * + a NIP-44 cipher, both of which nostr-tools covers directly
 * (`finalizeEvent`,
 * `getPublicKey`, `nip44`), so no reactive store/query layer was needed.
 */

import { nip19, nip44, getPublicKey, finalizeEvent } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';

/**
 * Signer type
 */
export type SignerType = 'local';

/**
 * NIP-44 conversation cipher surface (matches the NIP-07 signer shape the app
 * relies on: `encrypt(counterpartyPubkey, plaintext)` / `decrypt(...)`).
 */
export interface Nip44Cipher {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

/**
 * Minimal NIP-07-style signer surface (previously @nostrify's `NostrSigner`).
 */
export interface BaseNostrSigner {
  getPublicKey(): Promise<string>;
  signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent>;
  readonly nip44: Nip44Cipher;
}

/**
 * Extended signer interface with type info
 */
export interface NostrSigner extends BaseNostrSigner {
  /** Get the signer type */
  getType(): SignerType;
  /** Close connections (no-op for local signer) */
  close?(): void;
  /** Get the secret key (only available for local signers) */
  getSecretKey?(): Uint8Array | null;
}

/**
 * Local signer wrapper (nsec held in memory; NIP-44 via nostr-tools).
 */
class LocalSignerWrapper implements NostrSigner {
  private secretKey: Uint8Array;

  constructor(secretKey: Uint8Array) {
    this.secretKey = secretKey;
  }

  async getPublicKey(): Promise<string> {
    return getPublicKey(this.secretKey);
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    return finalizeEvent(event, this.secretKey);
  }

  getType(): SignerType {
    return 'local';
  }

  getSecretKey(): Uint8Array {
    return new Uint8Array(this.secretKey);
  }

  get nip44(): Nip44Cipher {
    const sk = this.secretKey;
    return {
      async encrypt(pubkey: string, plaintext: string): Promise<string> {
        const conversationKey = nip44.getConversationKey(sk, pubkey);
        return nip44.encrypt(plaintext, conversationKey);
      },
      async decrypt(pubkey: string, ciphertext: string): Promise<string> {
        const conversationKey = nip44.getConversationKey(sk, pubkey);
        return nip44.decrypt(ciphertext, conversationKey);
      },
    };
  }
}

/**
 * Login data structure
 */
export interface LoginData {
  type: 'nsec';
  pubkey: string;
  nsec?: string;
}

/**
 * Create a signer from login data
 */
export function createSignerFromLogin(login: LoginData): NostrSigner | null {
  if (login.type === 'nsec' && login.nsec) {
    try {
      const decoded = nip19.decode(login.nsec);
      if (decoded.type !== 'nsec') return null;
      return new LocalSignerWrapper(decoded.data);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Get signer from current login stored in keyring
 */
export async function getSignerFromStoredLogin(): Promise<NostrSigner | null> {
  // Import dynamically to avoid circular dependencies
  const { getCurrentLogin } = await import('./login');
  const login = await getCurrentLogin();
  if (!login) return null;
  return createSignerFromLogin(login);
}
