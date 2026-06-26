// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AIProviderProxy } from '../types';
import { assertProviderAllowed } from '../../lib/provider-policy';

// Provider lockdown chokepoint: every custom-provider HTTP call goes through this
// adapter, so the vendor-exclusion policy is enforced here. Refuses Meta/OpenAI/xAI
// endpoints and model ids before any request leaves the machine. See
// src/lib/provider-policy.ts (the unit-tested policy) and src/lib/ai-credentials.ts.
function modelFromBody(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { model?: string };
    return parsed.model;
  } catch {
    return undefined;
  }
}

export const ai: AIProviderProxy = {
  customProviderRequest(url, apiKey, body) {
    assertProviderAllowed(url, modelFromBody(body));
    return invoke<string>('custom_provider_request', { url, apiKey, body });
  },
  async customProviderStream(requestId, url, apiKey, body) {
    assertProviderAllowed(url, modelFromBody(body));
    await invoke<void>('custom_provider_stream', { requestId, url, apiKey, body });
  },
  customProviderListModels(url, apiKey) {
    assertProviderAllowed(url);
    return invoke<string>('custom_provider_list_models', { url, apiKey });
  },
  async onCustomProviderChunk(requestId, cb) {
    const off = await listen<string>(`custom-provider-stream-${requestId}`, (event) =>
      cb(event.payload),
    );
    return () => off();
  },
};
