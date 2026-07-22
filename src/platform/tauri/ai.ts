// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AIProviderProxy } from '../types';

// Direct Chat (non-agentic) proxy adapter. The vendor-exclusion policy is now
// enforced in COMPILED Rust inside the custom_provider_* commands
// (src-tauri/src/direct_chat_policy.rs) — Meta/OpenAI/xAI endpoints and model
// ids are refused there, in the shipped binary, before any request leaves the
// machine. Policy that ships as editable webview text was the disease being
// cured (ADR-0008); this adapter is now a thin transport that surfaces the
// Rust refusal to the UI.

export const ai: AIProviderProxy = {
  customProviderRequest(url, apiKey, body) {
    return invoke<string>('custom_provider_request', { url, apiKey, body });
  },
  async customProviderStream(requestId, url, apiKey, body) {
    await invoke<void>('custom_provider_stream', { requestId, url, apiKey, body });
  },
  customProviderListModels(url, apiKey) {
    return invoke<string>('custom_provider_list_models', { url, apiKey });
  },
  async onCustomProviderChunk(requestId, cb) {
    const off = await listen<string>(`custom-provider-stream-${requestId}`, (event) =>
      cb(event.payload),
    );
    return () => off();
  },
};
