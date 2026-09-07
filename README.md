# Alfred

**Agentic development brain for builders using the Wecanjustbuildthings.dev connective intelligence system**

Alfred is the memory of your build. It's for the builder — the person who directs
tools to build software but doesn't write the code themselves. Your specs, decisions,
context, and reasoning live here as plain files, and your tools read that record
before they act, so they work from what you decided instead of guessing.

The platform is the judgment; **goose** is the hands; **Alfred is the memory.** Part
of [wecanjustbuildthings.dev](https://github.com/MartinMontero/wecanjustbuildthings.dev).

Your notes are plain Markdown files on your own disk. Your keys stay in your OS
credential store. Nothing syncs anywhere unless you choose to, and when it does it's
encrypted with your keys first. You stay in control and informed at every step.

## Status

> **Phases 0–5 shipped, and the project has since moved past the phase plan into open
> beta** — built on native Windows 11. See [`docs/audit/`](docs/audit) for the per-phase
> record and [`CLAUDE.md`](CLAUDE.md) for the standing context. Each claim below cites
> the audit or decision document that proves it.

- **Phase 0** — an independent AGPL repository with a clean dual build
  ([`docs/audit/phase0.md`](docs/audit/phase0.md)).
- **Phase 1** — ethos hardening: removed the bundled vendor tooling, the
  Soapbox-maintained Nostr stack (now [nostr-tools](https://github.com/nbd-wtf/nostr-tools)),
  and React; added the app-side **provider denylist** (excludes only Meta, OpenAI, and
  xAI — permits every other provider/model, including Anthropic, Google, Mistral,
  open-weights, and local/Ollama) ([`docs/audit/phase1.md`](docs/audit/phase1.md)).
- **Phase 2** — the **agentic vault scaffold**: a deterministic note topology, a
  `hot.md` current-state anchor, load-bearing frontmatter, tiered memory, a Spec Kit
  flow, and a Proposal-First "Librarian" that suggests but never edits without approval
  ([`docs/audit/phase2.md`](docs/audit/phase2.md)).
- **Phase 3** — the **Alfred MCP server** ([`docs/mcp-server.md`](docs/mcp-server.md)):
  exposes the vault as ground truth to any agent harness over stdio, with strict,
  path-confined, traversal-proof tools ([`docs/audit/phase3.md`](docs/audit/phase3.md)).
- **Phase 4** — the **embedded goose harness** ([`docs/goose.md`](docs/goose.md)):
  Alfred drives [goose](https://goose-docs.ai/) over ACP, reads the vault via
  the MCP extension, and runs recipes and subagents — with the provider denylist
  enforced so excluded vendors are unreachable through Alfred
  ([`docs/audit/phase4.md`](docs/audit/phase4.md)).
- **Phase 5 — observability & agent safety: every planned step landed**
  ([`docs/audit/phase5.md`](docs/audit/phase5.md)): the **recipe safety scanner**
  (strips invisible/deceptive Unicode, pre-flight preview of every action);
  **deny-by-default tool-permission gating** (read-only vault tools run freely, every
  write and shell action asks first — the spoofable title-keyed auto-allow path was
  found and removed); a **born-redacted telemetry spine** (opt-in, off by default,
  local-only, honest wipe); **cross-stack trace correlation** (SEP-414 / W3C Trace
  Context across ACP and MCP); the **latency–accuracy guardrail**; the **context-probe
  harness**; the **memory-poisoning review gate** (agent-authored durable facts queue
  for human review, never auto-promote); and the desktop **Privacy & Telemetry**
  settings UI. The Windows-execution proofs ran green against staged goose 1.41.0
  (vitest 258/258 with zero skips, cargo 9/9 —
  [`docs/audit/safety-spine-verification.md`](docs/audit/safety-spine-verification.md)).
  Phase-close items remain open per the audit: the completion section plus a
  phase-close `verify:all` re-run on Windows, the paid live-activation turn for the
  guardrail, and the `engines`-field decision.

### Beyond the phase plan

- **Compiled agent guard (Holmes Stage 1)** — the TypeScript provider-policy layer was
  deleted; which providers and models may drive the agent, and how every goose process
  is spawned, is now decided by the compiled `holmes-guard` crate (a deny-by-default
  roster on the agentic surface; Direct Chat keeps its vendor denylist, likewise
  compiled into Rust). The UI reads the permitted roster from the crate and never
  enforces anything itself. ([ADR-0008](docs/decisions/0008-holmes-guard-adoption.md),
  [`docs/audit/holmes-stage1-track1-mapping.md`](docs/audit/holmes-stage1-track1-mapping.md))
- **Artifact-level guard CI and the five-job gate** — CI checks the *built binary*
  itself: the `artifact-guard` job proves the shipped artifact refuses excluded
  providers and clears hostile settings. The full gate is five jobs — `verify`,
  `rust`, `artifact-guard`, `supply-chain`, `quality` — with every GitHub Action pinned
  to a commit SHA. ([`.github/workflows/ci.yml`](.github/workflows/ci.yml),
  [`docs/audit/stage-d-vulnerability-decision.md`](docs/audit/stage-d-vulnerability-decision.md))
- **Open beta line** — beta.2 and beta.3 were published; beta.4 was tagged but never
  published (its pin still pointed at goose 1.41.0, the skew that forced the re-cut);
  beta.5 (numeric 0.1.4) is drafted and pending review. In-app updates are served by a
  **per-installer updater feed** that the release lane authors itself (separate
  NSIS/MSI/fallback keys) and re-verifies by downloading the feed back off the release.
  ([`docs/beta/`](docs/beta), [ADR-0009](docs/decisions/0009-per-installer-updater-feed.md))
- **Desktop-only, settled** — there is no user-facing web build; the web bundle exists
  only as an internal CI/development harness, guarded by a test so it can never ship.
  ([ADR-0010](docs/decisions/0010-no-hosted-web-app.md))
- **Graph-engineering convention** — [`RECIPE.md`](RECIPE.md) is the persistent
  dependency graph of record; `gate.ps1` runs every proof line (`10/10 subsystems
  PASS` to be done), and its `-SelfTest` proves the gate can fail by planting a
  drifted proof, watching the FAIL fire, and restoring.
  ([`docs/audit/2026-09-04-graph-install.md`](docs/audit/2026-09-04-graph-install.md))

One honest gap: the repo pins goose **1.43.0** (`scripts/stage-goose-sidecar.mjs`,
`release.yml`) but the staged Windows sidecar binary still reports **1.41.0** — the
re-stage and the live-goose test trio against 1.43.0 remain open on the
Windows/release lane
([`docs/audit/2026-09-04-graph-install.md`](docs/audit/2026-09-04-graph-install.md),
[`docs/beta/RELEASE-NOTES-v0.1.0-beta.5.md`](docs/beta/RELEASE-NOTES-v0.1.0-beta.5.md)).

Phases 6–7 ahead: the AT Protocol domain pack, then platform integration and i18n.

## What it does today

**As a notes app:**

- A **Markdown editor** with live preview, slash commands, `[[wikilinks]]`, backlinks,
  an outline, a graph view, daily notes, templates, and a YAML frontmatter Properties panel.
- **Your files, your disk** — the vault is plain `.md` files; everything works offline.
- **Nostr sync** — content is **NIP-44** encrypted with your keys *before* it reaches a
  relay; only you can decrypt it.
- **Secure storage** — private keys live in the OS credential store and are never logged.
- **A desktop app, by design** — Alfred is a native desktop application. There is **no
  hosted web version and no browser app**: local-first means your program and your files
  live on your own machine, not on someone else's server. That is the whole point, not a
  limitation.

**As an external mind for agentic development:**

- A **vault scaffold** that gives your project a durable structure for specs, decisions,
  and memory — born compliant with the project's standards.
- An **MCP server** that hands your tools the vault as ground truth, read-first and
  write-confirmed, so an agent works from your decisions instead of guessing.
- An **embedded goose harness** that runs agentic work against the vault, with the
  compiled provider guard, the recipe safety scanner, and tool-permission gating all in
  the path.
- An **evidence review surface** that shows analytical findings only after they pass the
  evidence gate, with each finding's limits stated in full. Collecting evidence for you —
  the investigative mode — is **not part of this beta**; it sits behind separate safety
  gates and is not switched on.

## Principles

- **You own it all** — the code, the data, and the keys; everything runs and lives on
  your machine, with no dependence on extractive platforms.
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

# Desktop production build  ->  src-tauri\target\release\<app>.exe
#                               + installers in bundle\{msi,nsis}\
npm run tauri build
```

Code signing is a distribution step, deferred until release (unsigned installers trigger
SmartScreen but build and run locally).

> **Sibling checkout required for the vendor-exclusion checks.** `npm run
> check:exclusion` and `npm run check:exclusion:l3` (both part of `npm run verify:all`)
> run the platform's own enforcement engine, which the scripts reference as
> `../wecanjustbuildthings.dev`. Clone
> [wecanjustbuildthings.dev](https://github.com/MartinMontero/wecanjustbuildthings.dev)
> as a sibling folder next to this repo (`npm ci --prefix ../wecanjustbuildthings.dev
> --ignore-scripts` to install its tooling), or those checks cannot run. CI does this
> for you (`.github/workflows/ci.yml`); locally you must do it once. See
> [`CONTRIBUTING.md`](CONTRIBUTING.md).

> **Internal note (not a shipping target):** `npm run build:web` produces a browser
> build under `dist-web/`. It exists **only** as an internal development and test
> harness — CI runs the accessibility/performance gates against it because the shared
> container cannot build Tauri. It is never deployed, never published, and never offered
> to users. Alfred ships as the desktop app only. See
> [`docs/decisions/0010-no-hosted-web-app.md`](docs/decisions/0010-no-hosted-web-app.md).

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
