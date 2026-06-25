# Verification pass — current facts (June 2026)

Operational distillation of the primary-source verification pass run 24 Jun 2026. **This file is authoritative on versions, tools, and commands — where it conflicts with any other report in `docs/research/`, this file wins.** Every item was confirmed against an official source (linked in the full verification report). Re-verify the fast-moving ones at build time (see bottom).

## The clean, zero-Soapbox Nostr stack (mandatory)

- **Remove entirely:** `@nostrify/nostrify` (Soapbox-maintained — repo soapbox-pub/nostrify, npm publisher `alexgleason`; Onyx pins ^0.48.3). Also remove any `@soapbox.pub/js-dev-mcp` / `@soapbox/js-dev-mcp` / `jsr:@soapbox/docs-mcp` (these live in `.mcp.json` dev tooling, not package.json — inspect and delete).
- **Use instead:** `nostr-tools` (nbd-wtf) as the base + `applesauce` (hzrd149, MIT — reactive event-store/query layer, SolidJS-friendly) for the higher-level roles Nostrify filled. Crypto stays on the audited `@noble/ciphers` + `@noble/hashes` (already direct deps).
- **Nostrify-role → replacement map:** NIP-44 → nostr-tools `nip44` (+ @noble); NIP-46 bunker → nostr-tools `BunkerSigner` (incl. `nostrconnect://` via `fromURI()`); NIP-51 lists / NIP-23 long-form / NIP-19 `naddr` → nostr-tools; relay pool → nostr-tools `SimplePool`; event validation + storage → nostr-tools `verifyEvent` + applesauce queries, with hand-written zod schemas replacing Nostrify's `NSchema`.
- **License note:** `nostr-tools` is published under **Unlicense** (not MIT) — permissive and AGPL-compatible, but record it accurately in the SBOM/license docs.
- **NDK** (`@nostr-dev-kit/ndk`, MIT) is **not** Soapbox and is a valid alternative, but it has **no first-class SolidJS binding** (Svelte 5 / React / React Native only). If used at all, use only its framework-agnostic core. For Alfred, prefer nostr-tools + applesauce.

## goose embedding (current, verified)

- **Version / home:** goose **v1.38.0** (2026-06-17), Apache-2.0, now governed by the Linux Foundation's **Agentic AI Foundation (AAIF)** at **github.com/aaif-goose/goose**, docs at **goose-docs.ai**. (The `block/goose` repo redirects here.)
- **Primary embed path:** **`goose acp`** — runs goose as an ACP agent server over **stdio (JSON-RPC)**; the client manages the process lifecycle. This is the documented path JetBrains/Zed use.
- **Driver SDK:** **`@agentclientprotocol/sdk` v0.25.0** (Apache-2.0) — **renamed** from `@zed-industries/agent-client-protocol` (the old package is deprecated). Alfred's SolidJS UI is the ACP **client** (`ClientSideConnection`); goose is the ACP **agent**. There is **no official goose TypeScript SDK** — use the ACP SDK.
- **Secondary path (only if HTTP needed):** `goose serve` — ACP-over-HTTP/WebSocket, single `POST /acp`; auth via `GOOSE_SERVER__SECRET_KEY` → `X-Secret-Key` header (or `?token=` for WS); rides a *draft* "ACP over Streamable HTTP" standard. **Legacy `goosed` / `goose-server` / `goose-acp-server` are on the removal path — do not build on them.**
- **CRITICAL — vendor leakage in stock goose:** the default goose build **bundles OpenAI and xAI providers and an OpenAI-Codex ACP bridge.** Alfred must **never embed stock goose.** It must ship a **custom goose distribution** (per `CUSTOM_DISTROS.md`): an `init-config.yaml` + bundled `config.yaml` preconfiguring **only Anthropic, Google, and local/Ollama**, stripping the OpenAI/xAI providers and the Codex bridge, and hiding provider selection in the UI. `GOOSE_PROVIDER`/`GOOSE_MODEL` env lockdown is necessary but **not sufficient** on its own.
- **MCP as extension:** goose consumes MCP servers as "extensions" (`type: builtin | stdio | streamable-http`) via `~/.config/goose/config.yaml`, recipe `extensions:` blocks, or `--with-extension`. Alfred's own MCP server registers here so goose reads the vault by default.
- **Recipes:** YAML — `instructions`/`prompt` (≥1 required), `parameters` (defaults for optional), `settings` (`goose_provider`, `goose_model`, `temperature`, `max_turns`), `extensions`, `sub_recipes`, `activities`. Validate with `goose recipe validate`.
- **Security — Operation Pale Fire (Jan 2026, confirmed):** weaponized shared recipes hid malicious instructions in **zero-width Unicode** (U+200B zero-width space, U+200C zero-width non-joiner) inside YAML — invisible to humans, tokenized by the LLM. goose's mitigations: **strip zero-width Unicode from recipe inputs** and **render a pre-flight preview of every action a recipe will take** before execution, plus tool-permission controls and sandbox mode. Alfred's recipe scanner must do the same.

## MCP server

- Build on the **stable 2025-11-25** spec with **`@modelcontextprotocol/sdk` v1.29.0** (MIT), Zod schemas, **stdio** transport (optional Streamable HTTP behind opt-in; use the official Host-header/DNS-rebinding-protected middleware).
- v2 SDK is **pre-alpha** on `main`; stable **v2 expected Q3 2026** alongside the new **2026-07-28** spec (stateless core, Extensions framework, MCP Apps, Tasks, W3C Trace Context / SEP-414, OAuth/OIDC hardening). v1.x gets fixes ≥6 months after v2. **Do not build on the RC.** Adopt the W3C Trace Context key names now for forward-compat; plan a re-verify pass after 28 Jul 2026.

## Clone base (Onyx)

- License **MIT** (confirmed). **Version drift:** the GitHub "latest release" tag is **v0.15.0** (11 Jun 2026) but `package.json` on `main` is **v0.16.1** — **clone `main` and pin the exact commit SHA** for provenance, unless there's reason to prefer the tag.
- Stack confirmed: Tauri 2 (`@tauri-apps/api` ^2.9, CLI ^2.9), SolidJS ^1.9.10, CodeMirror 6, Milkdown 7.18. Dual targets confirmed (`build` Tauri / `build:web` PWA via `vite-plugin-pwa`).
- **React-exclusion catch:** `qrcode.react` is a dependency — audit it; if it pulls React (Meta-owned), replace with a non-React QR library. Also remove `@opencode-ai/sdk` (OpenCode is out; goose is the harness).
- Custom event kinds (preserve/extend with sign-off): 30800 file, 30801 vault index, 30802 shared doc (NIP-44); 30023/30024 articles/drafts; 10000 mute.

## Tauri sidecar (for spawning goose)

Declare goose as `externalBin` in `tauri.conf.json`, ship per-arch binaries with `-$TARGET_TRIPLE` suffixes, launch via `app.shell().sidecar(name)` (Rust) / `Command.sidecar()` (JS). **Requires the shell plugin initialized and an explicit execute/spawn permission in `src-tauri/capabilities/`.**

## Supply-chain / QA tooling

- **OSV-Scanner** (primary SCA) + **Syft/Grype** (SBOM + match) + **cargo-audit/cargo-deny** (Rust; cargo-deny also enforces the vendor ban at crate level) + **gitleaks** (secrets) + **lychee** (links) + **Biome** + **Vitest** + **axe-core** + **Lighthouse CI**. All current/healthy.
- **NO Trivy.** **CVE-2026-33634** is real, actively exploited, **CISA-KEV-listed (added 26 Mar 2026)**, **CVSS 9.4** — the "TeamPCP" compromise published malicious Trivy binaries and force-pushed `trivy-action`/`setup-trivy` tags to credential-stealing malware. Exclude Trivy entirely.
- **Pin every GitHub Action to a full commit SHA** (the core lesson of the Trivy incident).

## AT Protocol (born-compliant pack)

- Repo binary format **v3**. Canonical CBOR is now called **DRISL** (successor to DAG-CBOR; multicodec **0x71**); older "DAG-CBOR" naming is equivalent. Blobs use the `raw` codec; CIDs use SHA-256.
- **MST key depth:** SHA-256 the key (binary), count leading binary zeros, **÷2 round down**. The spec says "fanout 4 (2-bit chunks)"; indigo Go docs say "fanout 16" — **same 2-bit-per-layer algorithm, inconsistent label. Implement the algorithm; ignore the label.** Changing fanout forces a repo-version bump.
- **Record path:** `<collection>/<rkey>` — exactly two segments, no leading slash; allowed ASCII `A-Za-z0-9/.-_~`; no `.`/`..` segments.
- **Identity:** `did:plc` / `did:web`; DID doc `verificationMethod` `type: Multikey`, `id` ends `#atproto`. **`publicKeyMultibase` = base58btc, leading `z`.** Current Multikey encoding = compressed key bytes + multicodec key-type prefix; **legacy** = uncompressed bytes, no prefix (still accepted in transition). Curves **P-256 and K-256**; low-S signatures; PDS in `service[]` with `id` ending `#atproto_pds`.
- **Codegen-only:** never hand-edit generated XRPC; edit lexicons and run codegen.
- **Host migration:** bluesky-social repos (`atproto`, `indigo`, `jetstream`) may move hosts (indigo already mirrored to gitlab.com/wysteriary, some crates on tangled.org) — **re-derive dependency tables from live sources at build time.**

## Re-verify at build time (these move)

goose version + ACP surface (ACP is explicitly labeled "emerging… may evolve"); `@agentclientprotocol/sdk` (pre-1.0, ~weekly — pin **v0.25.0**); MCP **2026-07-28** (finalizes 28 Jul 2026); `@modelcontextprotocol/sdk` v2 (Q3 2026); Spec Kit exact patch (commands are now `/speckit.*`, CLI `specify` via `uvx`); atproto repo hosts; any new advisory on the supply-chain tools above.
