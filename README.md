# Alfred

**Your sovereign, local-first external mind for building with AI.**

Alfred is a Nostr-native personal knowledge management tool for the *builder* — the
person who directs AI to build software but doesn't write the code themselves. It's
the persistent place your specs, decisions, context, and memory live, and the ground
truth your agentic AI dev tools read before they act.

The platform is the judgment; **goose** is the hands; **Alfred is the memory.** Part
of [wecanjustbuildthings.dev](https://github.com/MartinMontero/wecanjustbuildthings.dev).

Your notes are plain Markdown files on your own disk. Your keys stay in your OS
credential store. Nothing syncs anywhere unless you choose to, and when it does it's
encrypted with your keys first. You stay in control and informed at every step.

## Status

> **Phases 0–4 complete; Phase 5 (observability & agent safety) in progress** — built
> on native Windows 11. See [`docs/audit/`](docs/audit) for the per-phase record and
> [`CLAUDE.md`](CLAUDE.md) for the standing context.

- **Phase 0** — an independent AGPL repository with a clean dual build.
- **Phase 1** — ethos hardening: removed the bundled vendor tooling, the
  Soapbox-maintained Nostr stack (now [nostr-tools](https://github.com/nbd-wtf/nostr-tools)),
  and React; added the app-side **provider denylist** (excludes only Meta, OpenAI, and
  xAI — permits every other provider/model, including Anthropic, Google, Mistral,
  open-weights, and local/Ollama).
- **Phase 2** — the **agentic vault scaffold**: a deterministic note topology, a
  `hot.md` current-state anchor, load-bearing frontmatter, tiered memory, a Spec Kit
  flow, and a Proposal-First "Librarian" that suggests but never edits without approval.
- **Phase 3** — the **Alfred MCP server** ([`docs/mcp-server.md`](docs/mcp-server.md)):
  exposes the vault as ground truth to any AI harness over stdio, with strict,
  path-confined, traversal-proof tools.
- **Phase 4** — the **embedded goose harness** ([`docs/goose.md`](docs/goose.md)):
  Alfred drives [goose](https://block.github.io/goose/) over ACP, reads the vault via
  the MCP extension, and runs recipes and subagents — with the provider denylist
  enforced so excluded vendors are unreachable through Alfred.
- **Phase 5 (in progress)** — shipped so far: a **recipe safety scanner** that strips
  invisible/deceptive Unicode and shows a pre-flight preview of every action before a
  recipe runs; **tool-permission gating** (deny-by-default — read-only vault tools run
  freely, every write and shell action asks first); and a **born-redacted telemetry
  spine** (opt-in, off by default, local-only, with an honest wipe). Still ahead in
  this phase: cross-stack traces, a latency–accuracy guardrail, context probes, and the
  memory-poisoning + privacy controls.

Phases 6–7 ahead: the AT Protocol domain pack, then platform integration and i18n.

## What it does today

**As a notes app:**

- A **Markdown editor** with live preview, slash commands, `[[wikilinks]]`, backlinks,
  an outline, a graph view, daily notes, templates, and a YAML frontmatter Properties panel.
- **Local-first** — your vault is plain `.md` files on disk; everything works offline.
- **Nostr sync** — content is **NIP-44** encrypted with your keys *before* it reaches a
  relay; only you can decrypt it.
- **Secure storage** — private keys live in the OS credential store and are never logged.
- **One codebase, two builds** — a **Tauri desktop app** and a zero-backend **PWA**,
  behind a `src/platform/{tauri,web}` abstraction.

**As an external mind for agentic development:**

- A **vault scaffold** that gives your project a durable structure for specs, decisions,
  and memory — born compliant with the project's standards.
- An **MCP server** that hands your AI tools the vault as ground truth, read-first and
  write-confirmed, so an agent works from your decisions instead of guessing.
- An **embedded goose harness** that runs agentic work against the vault, with the
  provider denylist, the recipe safety scanner, and tool-permission gating all in the path.

## Principles

- **Sovereign & local-first** — you own the code, the data, and the keys; no dependence
  on extractive AI platforms.
- **Builder agency** — no silent moves. Before anything destructive or outward-facing,
  Alfred tells you what and why, and leaves the final say with you.
- **Deny-by-default** — excluded providers are unreachable; agent tools that write or run
  commands ask first; telemetry is off until you opt in.
- **Born-redacted & minimize-inference** — telemetry records only counts, durations, and
  names — never note content, prompts, or secrets — and the core never calls a model
  behind your back.

## Build target

The first build is **native Windows 11** (no WSL2). See
[`docs/research/windows-build-2026-06.md`](docs/research/windows-build-2026-06.md) for the
authoritative toolchain notes.

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

Code signing is a distribution step, deferred until release (unsigned installers trigger
SmartScreen but build and run locally).

## How sync works

Alfred uses custom Nostr event kinds for encrypted file sync — your content is encrypted
to your own keys before it leaves the machine:

| Kind  | Purpose            | Encryption            |
|-------|--------------------|-----------------------|
| 30800 | File content       | NIP-44 (self)         |
| 30801 | Vault index        | NIP-44 (self)         |
| 30802 | Shared documents   | NIP-44 (recipient)    |
| 30023 | Published articles | None (public)         |
| 30024 | Draft articles     | None (public)         |
| 10000 | Mute list          | NIP-44 (self, optional) |

## Tech stack

- [Tauri 2](https://v2.tauri.app/) — Rust desktop framework (outputs `.exe` + MSI/NSIS)
- [SolidJS](https://www.solidjs.com/) — reactive UI (no React)
- [CodeMirror 6](https://codemirror.net/) + [Milkdown 7](https://milkdown.dev/) — editor
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) — Nostr protocol library

## Provenance & License

Alfred is **AGPL-3.0-or-later** — that is its only license; see [`LICENSE`](LICENSE).
It is an evolution from the MIT-licensed [`derekross/onyx`](https://github.com/derekross/onyx)
codebase; the upstream MIT notice — required attribution for *that* code, not a license
over Alfred — is preserved verbatim in
[`THIRD-PARTY-NOTICES/onyx-MIT.txt`](THIRD-PARTY-NOTICES/onyx-MIT.txt), with full provenance
and the security back-port cadence in [`ATTRIBUTION.md`](ATTRIBUTION.md),
[`UPSTREAM.md`](UPSTREAM.md), and [`NOTICE`](NOTICE).
