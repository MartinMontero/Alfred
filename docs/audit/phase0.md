# Phase 0 audit — clone, sever, re-identify, clean Windows build

**Date:** 2026-06-25
**Build target:** native Windows 11 (no WSL2)
**Goal:** an independent AGPL-3.0 Alfred repo that builds on Windows (both targets), with correct provenance and identity. No features.

---

## 1. Windows prerequisites (verified, not installed — all already present)

| Tool | Found | Required | OK |
|---|---|---|---|
| Git for Windows | 2.54.0.windows.1 | present + on PATH | ✅ |
| Rust (rustc/cargo) | 1.96.0 | rustup `stable-msvc` | ✅ |
| Rust host triple | `x86_64-pc-windows-msvc` | `x86_64-pc-windows-msvc` | ✅ |
| Node.js | **v24.16.0** | ≥ 22.12 (kit says "Node 22 LTS") | ✅ (exceeds floor) |
| npm | 11.13.0 | — | ✅ |
| VS Build Tools (C++) | implied — Rust MSVC links + desktop build succeeded | "Desktop development with C++" | ✅ |
| WebView2 | preinstalled (Win 11) | present | ✅ |

**Note on Node:** the standing context pins "Node 22 LTS (≥ 22.12)". The machine has **Node v24.16.0**, which clears the ≥22.12 floor and your `npx @tauri-apps/cli info` was green. Flagged here so you can pin to 22 LTS if you prefer strict parity; not a blocker for Phase 0 (both targets built on 24.16).

---

## 2. Provenance

| Field | Value |
|---|---|
| Upstream | `https://github.com/derekross/onyx` (`main`) |
| **Pinned commit** | `62d6d58d2af7a57f9a5954c611de47f252cb27bd` |
| Upstream version | `0.16.1` (package.json / Cargo.toml on `main`) |
| Import commit date | 2026-06-24 |
| Upstream license | MIT (declared in metadata; **no LICENSE file shipped upstream**) |

History severed (`rm -rf .git && git init -b main`). Remote set to `https://github.com/MartinMontero/Alfred.git`. Recorded in `UPSTREAM.md`.

### Commit sequence (fresh history)
1. `.gitattributes` (committed **first**, before any source — LF + binary/sidecar protection).
2. Pristine upstream import (241 files, attributes applied → canonical LF).
3. Relicense + re-identify + standing context + research bundle (this transformation).
4. This audit.

---

## 3. License / provenance compliance

- `LICENSE` → **AGPL-3.0-or-later**, byte-identical to the platform's verbatim FSF text (34,255 bytes).
- `LICENSE.onyx` → upstream MIT terms preserved, attributed to Derek Ross and the Onyx contributors.
- `NOTICE`, `ATTRIBUTION.md`, `UPSTREAM.md` (source SHA + **security cherry-pick cadence**) added.
- **SPDX headers** applied to **121 first-party source files** (`src/**`, `src-tauri/src/**`, `vite.config.ts`, `build.rs`, root scripts). 0 already had one; 8 non-source files (SVG/assets) skipped. Excluded from the sweep: `node_modules/`, `target/`, generated `src-tauri/gen/android/**`, JSON/MD/HTML/lockfiles.
- `nostr-tools` recorded as **Unlicense** in `ATTRIBUTION.md`.

> **Upstream-LICENSE discrepancy (honest note):** `derekross/onyx` declares MIT in `package.json`/`Cargo.toml`/`zapstore.yaml` but ships **no `LICENSE` file** at the pinned commit (verified: no "Permission is hereby granted…" text anywhere in the tree). There was nothing to "move," so `LICENSE.onyx` reproduces the canonical MIT text attributed to the upstream author, and the discrepancy is documented in `ATTRIBUTION.md` + `UPSTREAM.md`.

---

## 4. Re-identification (Onyx → Alfred)

| Surface | Onyx | Alfred |
|---|---|---|
| App / product name | Onyx | Alfred |
| npm package | `onyx` 0.16.1 | `alfred` 0.1.0 |
| Cargo package / lib | `onyx` / `onyx_lib` | `alfred` / `alfred_lib` (+ `main.rs` call) |
| Tauri bundle id | `com.onyxnotes.dev` | `dev.wecanjustbuildthings.alfred` |
| Deep-link scheme | `onyx://` | `alfred://` (tauri.conf, lib.rs, App.tsx protocol check, web `web+alfred`) |
| Keyring service | `com.onyx.app` | `dev.wecanjustbuildthings.alfred` |
| Keyring/secret keys | `onyx:login`, `onyx:profile`, `onyx:*` | `alfred:*` |
| Nostr app-data d-tag | `onyx/preferences` | `alfred/preferences` |
| Web IndexedDB name | `onyx` | `alfred` |
| Web vault-scope global | `__onyxVault` | `__alfredVault` (vault + assets) |
| Default vault dir | `Documents/Onyx`, `Onyx Notes`, `onyx-vault` | `Documents/Alfred`, `Alfred Notes`, `alfred-vault` |
| Desktop entry | `desktop/onyx.desktop` | `desktop/alfred.desktop` |
| PWA manifest / title | Onyx | Alfred |
| README / zapstore | Onyx | Alfred |
| CLAUDE.md / AGENTS.md | upstream agents file | the standing context |
| CI artifact names | `onyx-*` | `alfred-*` |
| User-facing copy | "Onyx" in Settings/Onboarding/Editor/UnlockDialog/CustomProviderChat | "Alfred" |

**Stale upstream docs removed** (Onyx/OpenCode planning artifacts, recoverable from upstream): `PLAN-onboarding-workflow.md`, `PLAN-opencode-chat-ui.md`, `PLAN-skills-library.md`, `WORKFLOW_INTEGRATION_SPEC.md`. Kept + retained `docs/NIP-XX-encrypted-file-sync.md` (documents the sync protocol Alfred preserves).

### Documented remaining "onyx" references (intentional or out-of-scope — NOT app identity)
1. **Provenance docs** (correct to mention upstream): `ATTRIBUTION.md`, `NOTICE`, `UPSTREAM.md`, `LICENSE.onyx`, `README.md`, `CLAUDE.md`/`AGENTS.md`, `docs/research/*`.
2. **External data-source URLs** — the skills system fetches `derekross/onyx-skills` (`Settings.tsx`, `Onboarding.tsx`, `skills.ts`). **Decision made** ([`docs/decisions/0001-skills-sourcing.md`](../decisions/0001-skills-sourcing.md)): **rebuild Alfred-native from scratch; drop the upstream dependency.** Investigation (2026-06-25) found 7 generic, OpenCode-coupled skills, MIT-by-README-only, no OpenAI/xAI/Soapbox provenance. Left untouched in Phase 0; the `onyx-skills` + `skills.sh` fetch is removed in Phase 1 with OpenCode (not rewritten); Alfred-native skills/recipes authored later via goose. No upstream content vendored.
3. **Files slated for Phase-1 deletion** (dead code): `OpenCodeChat.tsx`, `OpenClawChat.tsx` contain "Onyx" branding strings.
4. **Out-of-scope Android scaffold** `src-tauri/gen/android/**` (Java package `com.onyxnotes`, strings, gradle) — generated output for a platform this Windows phase does not build; regenerated by `tauri android init` with the new bundle id when/if Android is targeted.
5. **Auto-generated lockfiles** `package-lock.json` / `Cargo.lock` — regenerate to `alfred` on install/build (package-lock now shows `alfred@0.1.0`).
6. **Upstream issue reference** in `main.rs` (WebKitGTK workaround → `derekross/onyx/issues/19`) — kept as accurate provenance.
7. **Unused branding asset** `src-tauri/icons/onyx-rock.svg` (referenced nowhere) — icon/brand redesign is a later design task.

---

## 5. Soapbox + exclusion debt inventory (Phase 0 inventories only; Phase 1 removes)

### Soapbox (hard zero — Phase 1 mandatory)
| Item | Where | Action (Phase 1) |
|---|---|---|
| `@nostrify/nostrify@0.48.3` | `package.json` dep (installed: `node_modules/@nostrify/{nostrify,types}`) | remove → migrate to `nostr-tools` + `applesauce` |
| `@soapbox.pub/js-dev-mcp` | `.mcp.json` → `js-dev` server | delete the server entry |

`Select-String -Pattern soapbox` over the source tree returns only: the two items above **plus** documentation text in `CLAUDE.md`/`AGENTS.md`/`ATTRIBUTION.md`/`UPSTREAM.md`/`docs/research/*` (the standing-context constraint and research files describing the removal) — i.e. **no other live Soapbox code**. Benchmark for Phase 1: source-tree `soapbox` empty (excluding docs that name the policy) and `npm ls @nostrify/nostrify` empty.

### React exclusion catch (Meta-owned)
- `npm ls react react-dom` → **`qrcode.react@4.2.0` → `react@19.2.3`**. React **is** in the tree.
- `qrcode.react` declares React as a **peerDependency** (`^16||^17||^18||^19`); npm auto-installed `react@19.2.3`.
- **Phase 1:** replace `qrcode.react` with a non-React QR library (the `qrcode` package is already a direct dep; or another SolidJS-friendly QR lib). Then confirm `npm ls react` empty.

### OpenCode / OpenClaw
- `@opencode-ai/sdk@1.1.28` present (`package.json`). **Phase 1:** remove the dep + delete `OpenCode*`/`OpenClaw*` components and `src/lib/opencode`,`openclaw`. (Keep xterm.js for goose in Phase 4.)

### `.mcp.json` servers (full inventory)
| Server | Package | Status |
|---|---|---|
| `js-dev` | `@soapbox.pub/js-dev-mcp@latest` | **Soapbox — remove Phase 1** |
| `nostr` | `@nostrbook/mcp@latest` | not Soapbox; review provenance in Phase 1 |
| `tauri` | `@hypothesi/tauri-mcp-server@latest` | not Soapbox |

### Dogfooded exclusion engine (`enforcement/cli.ts all --tree .`)
**Deferred — needs your go-ahead.** The engine depends on the platform's dev deps (`yaml`, `@yarnpkg/parsers`, `@iarna/toml`) and the platform repo has **no `node_modules`**. Running it requires `npm install` inside the **read-only** `../wecanjustbuildthings.dev` repo — an environment change in a repo we treat as read-only, so per standing-context rule 9 I did **not** do it silently.
- **Expected result if run now:** it would **flag React** (Meta, transitive via `qrcode.react`) and likely OpenAI provider-strings (`CustomProviderChat` "OpenAI-compatible", OpenCode) — all known Phase-1 removals. So a fully-green engine run is a Phase-1 outcome, not a Phase-0 one.
- **Recommendation:** wire the engine as the blocking CI gate in Phase 1 (after the removals), or give the go-ahead to `npm install` the platform deps now for a baseline run.

---

## 6. Supply chain (Phase 0 baseline)

- `npm install`: clean — **641 packages**, patch-package applied (2 patches), **1 low-severity** advisory (`npm audit`). No high/critical.
- **OSV-Scanner / Syft SBOM / Grype / cargo-audit / gitleaks:** not yet wired (these land with the `verify:all` CI gate in a later phase). **No Trivy** (per policy). Recorded here as a known gap, not a Phase-0 deliverable.

---

## 7. Builds (both targets)

### Web / PWA — `npm run build:web`
✅ **Pass.** `tsc --noEmit` clean; Vite built `dist-web/` in ~10s; `vite-plugin-pwa` generated `sw.js` + precache (25 entries). (Large-chunk warnings are pre-existing perf notes, addressed by Lighthouse gates later.)

### Desktop — `npm run tauri build`
✅ **Pass** (exit 0). Full LTO release build + WiX/NSIS bundling. The `alfred`/`alfred_lib`
crate rename compiled and linked cleanly. Outputs:

| Artifact | Path | Size |
|---|---|---|
| Raw binary | `src-tauri\target\release\alfred.exe` | 15 MB |
| MSI installer | `src-tauri\target\release\bundle\msi\Alfred_0.1.0_x64_en-US.msi` | 6.2 MB |
| NSIS installer | `src-tauri\target\release\bundle\nsis\Alfred_0.1.0_x64-setup.exe` | 4.8 MB |

(Unsigned — code signing deferred to distribution per the standing context.)

---

## 8. Done-when checklist

- [x] Independent repo, fresh history on `main`, remote → MartinMontero/Alfred
- [x] `.gitattributes` committed **first**
- [x] License/provenance/identity complete (AGPL + MIT preserved + SPDX + attribution)
- [x] Standing context persisted as `CLAUDE.md` + `AGENTS.md`
- [x] Research bundle (6 files) in `docs/research/`
- [x] Soapbox/exclusion debt inventoried (not fixed — Phase 1)
- [x] Web/PWA target builds
- [x] Desktop target builds → `alfred.exe` + `bundle\{msi,nsis}\` (MSI + NSIS)
- [x] Nothing in app identity says "Onyx" (residuals documented in §4)

**Stop for review before any push.**
