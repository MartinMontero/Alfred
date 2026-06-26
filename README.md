# Alfred

**Sovereign, local-first, Nostr-native Personal Knowledge Management for agentic AI development.**
A component of [wecanjustbuildthings.dev](https://github.com/MartinMontero/wecanjustbuildthings.dev).

Alfred is the persistent "external mind" where a non-developer's specs, decisions,
context, and memory live — and the ground truth their AI harness reads. The platform
is the judgment layer; **goose** is the hands; **Alfred is the memory.**

Alfred is an independent, **cloned (not forked)** evolution of the MIT-licensed
[`derekross/onyx`](https://github.com/derekross/onyx), relicensed **AGPL-3.0-or-later**
and re-identified as Alfred. See [`ATTRIBUTION.md`](ATTRIBUTION.md) and
[`UPSTREAM.md`](UPSTREAM.md) for full provenance and the security back-port cadence.

> **Status: Phases 0–3 complete** (of 8), building on native Windows 11.
> - **Phase 0** — independent AGPL repo, severed history, re-identified, clean dual build.
> - **Phase 1** — ethos hardening: OpenCode/OpenClaw removed, **zero Soapbox**
>   (`@nostrify/nostrify` → nostr-tools), **zero React** (`qrcode.react` dropped),
>   app-side provider lockdown (Anthropic + Google + local only).
> - **Phase 2** — the **agentic vault scaffold**: deterministic topology, `hot.md`
>   anchor, load-bearing frontmatter, tiered memory, Spec Kit flow, Proposal-First Librarian.
> - **Phase 3** — the **Alfred MCP server** ([`docs/mcp-server.md`](docs/mcp-server.md)):
>   exposes the vault as ground truth to any harness over stdio (spec 2025-11-25), with
>   strict, path-confined, traversal-proof tools.
>
> Still ahead: embedded goose harness (Phase 4), observability + agent safety (Phase 5),
> the AT Protocol pack (Phase 6), platform integration + i18n (Phase 7). See
> [`docs/audit/`](docs/audit) for the per-phase record and [`CLAUDE.md`](CLAUDE.md) for
> the standing context.

## What it is today

Inherited from the Onyx base and preserved in Alfred:

- **Markdown editor** with live preview, slash commands, wikilinks, backlinks, outline,
  graph view, daily notes, templates, and a YAML frontmatter Properties panel.
- **Local-first** vault — notes are plain `.md` files on disk and work offline.
- **Nostr sync** — content is **NIP-44** encrypted with your keys before it ever
  reaches a relay; only you can decrypt it.
- **Secure storage** — private keys live in the OS credential store, never logged.
- **Dual build target** — one codebase ships a **Tauri desktop app** and a
  zero-backend **PWA** (`build:web`), behind a `src/platform/{tauri,web}` abstraction.

## Build target

The first build is **native Windows 11** (no WSL2). See
[`docs/research/windows-build-2026-06.md`](docs/research/windows-build-2026-06.md)
for the authoritative Windows toolchain notes.

### Prerequisites (Windows 11)

- **Git for Windows** (adds Git to PATH; provides Git Bash)
- **Visual Studio Build Tools** with the **"Desktop development with C++"** workload
- **WebView2** (preinstalled on Windows 11)
- **Rust** via rustup — `rustup default stable-msvc` (host triple `x86_64-pc-windows-msvc`)
- **Node.js** ≥ 22.12

### Build

```powershell
# Install dependencies (runs patch-package via postinstall)
npm install

# Desktop dev (Tauri)
npm run tauri dev

# Web/PWA production build  ->  dist-web/
npm run build:web

# Desktop production build  ->  src-tauri\target\release\<app>.exe
#                               + installers in bundle\{msi,nsis}\
npm run tauri build
```

Code signing is a distribution step and is deferred until release (unsigned installers
trigger SmartScreen but build and run locally).

## How sync works

Alfred uses custom Nostr event kinds for encrypted file sync:

| Kind | Purpose | Encryption |
|------|---------|------------|
| 30800 | File content | NIP-44 (self) |
| 30801 | Vault index | NIP-44 (self) |
| 30802 | Shared documents | NIP-44 (recipient) |
| 30023 | Published articles | None (public) |
| 30024 | Draft articles | None (public) |
| 10000 | Mute list | NIP-44 (self, optional) |

## Tech stack

- [Tauri 2](https://v2.tauri.app/) — Rust desktop framework (outputs `.exe` + MSI/NSIS)
- [SolidJS](https://www.solidjs.com/) — reactive UI (no React)
- [CodeMirror 6](https://codemirror.net/) + [Milkdown 7](https://milkdown.dev/) — editor
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) — Nostr protocol library

## License

**AGPL-3.0-or-later** — see [`LICENSE`](LICENSE). The upstream Onyx MIT notice is
preserved in [`LICENSE.onyx`](LICENSE.onyx); see [`NOTICE`](NOTICE) and
[`ATTRIBUTION.md`](ATTRIBUTION.md).
