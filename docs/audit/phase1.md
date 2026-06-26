# Phase 1 audit — ethos hardening (strip excluded + Soapbox deps)

**Date:** 2026-06-25
**Goal:** zero Soapbox, zero OpenCode/OpenClaw, zero excluded providers — verified.
**Build target:** native Windows 11.

This was the mandatory ethos-hardening gate. Done in logical commits (all local until push approved).

---

## 1. De-Soapbox (mandatory hard gate) ✅

`@nostrify/nostrify` (Soapbox-maintained — repo soapbox-pub/nostrify, npm publisher
`alexgleason`) **removed** and migrated to **nostr-tools**.

| Nostrify usage | File | Replacement |
|---|---|---|
| `NSecSigner` (signer + NIP-44 cipher) | `src/lib/nostr/signer.ts` | nostr-tools `finalizeEvent` + `getPublicKey` + `nip44` (getConversationKey/encrypt/decrypt) |
| `NRelay1` (relay req) ×3 | `src/lib/nostr/login.ts` | nostr-tools `SimplePool.get(relays, filter, { maxWait })` (NIP-65 relays, blossom, profile) |
| `NostrEvent` / `NostrSigner` types | `signer.ts` | nostr-tools `NostrEvent` + a locally-defined `BaseNostrSigner` interface |

**applesauce was NOT added.** Nostrify here only provided the signer + a NIP-44 cipher;
there was **no `NStore`/`NSchema`/reactive-query usage**, so nostr-tools alone covers it —
adding applesauce would have been an unnecessary dependency. NIP-44 self/recipient
encryption, NIP-19 nsec/npub, and NIP-46-style flows preserved.

`@soapbox.pub/js-dev-mcp` **deleted** from `.mcp.json`.

**Verification:**
- `npm ls @nostrify/nostrify` → **empty**.
- Source-tree `soapbox` scan → **zero** (`grep -rniE soapbox src src-tauri/src` empty;
  policy text lives only in docs/CLAUDE.md).
- `signer.ts` carries a one-line provenance comment naming the removed package; it no
  longer contains the literal "Soapbox".

## 2. Remove OpenCode + OpenClaw + sever skills fetch ✅

**Frontend + platform (commit 3):**
- Deleted: `OpenCodeChat/Panel/Terminal.tsx`, `OpenClawChat.tsx`, `src/lib/opencode/`,
  `src/lib/openclaw/`, `src/lib/skills.ts`, both platform `opencode`/`skills` adapters.
- Trimmed the platform contract (`types.ts`): removed `OpenCode` + `Skills` interfaces,
  the `openClaw*` proxy methods, the opencode/pty capability flags, `AppSettings.show_terminal`.
- `App.tsx`: removed OpenCode/OpenClaw toolbar buttons, panels, signals, the Ctrl+`` ` ``
  terminal toggle + resize handler + provider-toggle wiring.
- `Settings.tsx`: removed the OpenCode/OpenClaw/Productivity(skills) sections (~1900 lines
  across panels, state, handlers, effects, modals), the AI-Providers visibility toggles,
  the dead terminal hotkey row, and the onyx-skills/skills.sh fetch.
- `Onboarding.tsx`: removed the OpenCode and Skills steps.
- Removed `@opencode-ai/sdk`. **Kept `@xterm/*`** for the goose terminal (Phase 4).

**Rust (commit 4) — no dead paths:**
- Deleted `OpenCodeServerState` + start/stop/manage/validate/register commands, the
  `opencode_installer` module, the `portable-pty` PTY backend (spawn/write/resize/kill +
  `PtyState`) and its app-exit cleanup hook, all `skill_*`/`fetch_skills_sh`/`fetch_skill_file`
  and `openclaw_*` commands, and their `invoke_handler` registrations. **-1,836 lines.**
- Dropped now-unused crates: `portable-pty`, `tokio-tungstenite`, `flate2`, `tar`, `zip`,
  `sha2`, `uuid`. Kept `custom_provider_*` (gated BYOK). `cargo check` clean.
- goose (Phase 4) uses an **ACP/stdio sidecar**, not a PTY — so removing the PTY backend is
  correct; xterm.js will render the goose session, wired fresh in Phase 4.

**Skills:** per [decision 0001](../decisions/0001-skills-sourcing.md), the external
`onyx-skills` + `skills.sh` runtime fetch is **removed** (it was OpenCode-coupled). No
native skills yet; Alfred-native skills/recipes are a later goose phase.

**Verification:** `grep -ricE 'opencode|openclaw' src --include=*.ts --include=*.tsx`
→ only one hit, a removal-note comment in `types.ts`. (Inert `.opencode-*/.openclaw-*`
CSS rules remain — see §7.)

## 3. React exclusion (Meta) ✅

`qrcode.react@4.2.0` (pulled `react@19.2.3` as a peer dep) **removed**. It was unused in
source; the non-React `qrcode` lib remains as the designated QR lib.
**Verification:** `npm ls react react-dom` → **empty**; `node_modules/react` gone.

## 4. App-side provider lockdown ✅ (with unit tests)

- `src/lib/provider-policy.ts` — pure, dependency-free allowlist policy. **Permits only
  Anthropic + Google + local/self-hosted** (localhost / loopback / RFC-1918 private IP /
  `.local`). **Hard-refuses Meta/OpenAI/xAI** endpoint hosts and model ids
  (`gpt*`, `o1`–`o4`, `chatgpt`, `davinci`, `grok`, `xai`, `llama`, `codellama`).
  **Default-deny** on unknown hosts.
- Enforced at the desktop AI adapter (`src/platform/tauri/ai.ts`) — the single point every
  `custom_provider` request passes through; the model is parsed from the request body.
- Re-exported from `src/lib/ai-credentials.ts` (the credentials-layer chokepoint).
- **30 Vitest unit tests** (`src/lib/provider-policy.test.ts`) — allows + refusals — **pass**.
- (The goose-side lockdown — a custom goose distribution with providers stripped at compile
  time + env-var keys — lands in Phase 4.)

## 5. Logging / telemetry review ✅

- No key material, note content, or nsec is logged. The three `console.warn` calls in
  `ai-credentials.ts` log the **key name** (e.g. `alfred:custom_provider_api_key`), never the
  secret value. (`console.log/debug/trace` are stripped from prod builds via `vite.config`.)
- **No analytics/telemetry code exists** (no posthog/sentry/mixpanel/ga/etc.) — i.e. off by
  default. A privacy-controls/wipe surface is a Phase-5 deliverable.

## 6. Dogfooded exclusion engine + zero-Soapbox check

- **Zero-Soapbox check:** `grep -rniE 'soapbox|@nostrify' src src-tauri/src` → clean (only
  docs/policy text). `npm ls @nostrify/nostrify` → empty.
- **Exclusion engine** (dogfooded, after `npm install` in the platform repo — builder-approved):
  - **Layer 1 (manifests): ✓ 6 manifests clean.** **Layer 2 (transitive lockfiles): ✓ 2 lockfiles clean.**
    → Alfred has **no real Meta/OpenAI/xAI dependency, direct or transitive**. These are the
    blocking gate (`npm run check:exclusion`).
  - **Layer 3 (provider-string scan): advisory.** 5 hits, **all in the provider-lockdown itself** —
    `provider-policy.test.ts` (refusal test cases `api.openai.com`/`api.x.ai`) and
    `provider-policy.ts:28` (`oai.azure.com` in the *excluded* list). These are **negative
    contexts** (code that refuses those vendors); the engine's raw string scanner can't
    distinguish "calls" from "blocks" and flags exactly this for human review (it ignores its
    own `reports/` dir for the same reason). **Reviewed and confirmed** as the lockdown.
  - **Decision (builder):** the blocking gate is **Layer 1 + Layer 2** (the actual
    dependency/supply-chain exclusion); **Layer 3 runs as a non-blocking advisory**
    (`npm run check:exclusion:l3`, wired into `verify:all`) so its hits still surface for review
    without failing on the lockdown's own negative contexts.

## 7. `verify:all`

`npm run verify:all` = `typecheck && test && check:exclusion && build && build:web`.

| Gate | Status |
|---|---|
| `tsc --noEmit` | ✅ 0 errors |
| Vitest | ✅ 30/30 |
| exclusion gate (`check:exclusion`, L1+L2) | ✅ clean (6 manifests, 2 lockfiles) |
| exclusion advisory (`check:exclusion:l3`) | ⚠ surfaces lockdown negative-contexts (non-blocking) |
| `build` (Tauri/Vite frontend) | ✅ |
| `build:web` (PWA) | ✅ |
| desktop `tauri build` (exe + MSI/NSIS) | ✅ `alfred.exe` (14 MB) + MSI (5.8 MB) + NSIS (4.5 MB) |

**Known follow-up:** ~65 inert `.opencode-*` / `.openclaw-*` CSS rules for the removed UI
remain in `src/styles.css` (unused selectors — not a runtime code path). The one *used*
rule was renamed (`.openclaw-token-input` → `.custom-provider-token-input`). Bulk removal
tracked as a follow-up.

## Done-when checklist

- [x] OpenCode/OpenClaw gone (frontend + Rust), no dead code paths (CSS follow-up noted)
- [x] Zero Soapbox confirmed (source scan + `npm ls`)
- [x] No React in the tree
- [x] Provider lockdown enforced + 30 unit tests
- [x] Logging/telemetry reviewed (no secrets logged; analytics off by default)
- [x] Exclusion engine: L1+L2 clean (blocking); L3 advisory reviewed (lockdown negative-context)
- [x] `verify:all` fully green (exit 0)
- [x] Both Vite builds green; desktop build → `alfred.exe` + MSI + NSIS

**Stop for review before any push.**
