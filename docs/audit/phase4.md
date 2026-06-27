# Phase 4 audit — goose as the embedded harness

**Date:** 2026-06-26
**Build target:** native Windows 11
**Goal:** Alfred drives goose via ACP over stdio; goose reads the vault by default;
only non-excluded providers are reachable through Alfred.

---

## 0. Live re-verification (mandatory — the snapshot was not trusted)

goose installed locally is **v1.39.0** (the research snapshot named v1.38.0), so
every load-bearing fact was re-derived from the running binary and the live docs
(`goose-docs.ai`, `github.com/aaif-goose/goose`). Findings and drift:

| Item | Snapshot (2026-06) | Live (v1.39.0) | Action |
|---|---|---|---|
| ACP stdio entry point | `goose acp` | **`goose acp` — "Run goose as an ACP agent server on stdio"** (new flag `--with-builtin`) | Confirmed; used as-is |
| Legacy server | `goosed`/`goose-server` deprecated | **Gone from the CLI** — only `serve` remains (ACP over HTTP/WebSocket) | Confirmed; not used |
| ACP driver SDK | `@agentclientprotocol/sdk` **0.25.0** | **1.0.0** (stable). `ClientSideConnection(toClient, stream)`, `ndJsonStream`, `PROTOCOL_VERSION = 1` all intact; methods are `session/new`, `session/prompt`. `ClientSideConnection` is now `@deprecated` in favour of `client().connectWith()` but still exported and functional. | **Pinned `^1.0.0`**; kept `ClientSideConnection` per the plan |
| Provider stripping | "Cargo-feature-gate providers" | **No per-provider Cargo features exist.** `crates/goose/Cargo.toml` gates `aws-providers`, `local-inference`, `otel`, `nostr`, `system-keyring`, … but **not** openai/xai/anthropic/google/ollama. Providers are compiled in and **enumerable over ACP** (`session/new` → `configOptions[provider].options` lists `openai`, `azure_openai`, `chatgpt_codex`, `codex`, `codex-acp`, `xai`, `xai_oauth`). | **Mechanism changed → config-level denylist, no fork** (decided with the builder) |
| Custom distribution | `CUSTOM_DISTROS.md` | Documents **config-file** control (init-config.yaml / config.yaml / env), precedence **env → config.yaml → defaults**. Not compile-time. | Adopted config-level approach |
| Config/keys env | — | `GOOSE_PROVIDER`, `GOOSE_MODEL`, `GOOSE_DISABLE_KEYRING` (→ plaintext `secrets.yaml`, so keys are passed **env-only**), **`GOOSE_PATH_ROOT`** (overrides *all* config/data/state — the isolation lever), `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OLLAMA_HOST`. | All used |

**Headline drift:** the plan assumed compile-time provider feature-gating; that
does not exist in goose v1.39.0. The builder confirmed the corrected approach: a
**config-level denylist, no fork** (AAIF / Linux Foundation provenance accepted).

## 0a. Provider correction carried over from Step A

The app-side lockdown was an **allowlist of three** (Anthropic + Google + local).
That was corrected to a **vendor-identity denylist** — exclude only Meta/OpenAI/xAI,
permit everything else (`src/lib/provider-policy.ts`, commit `db9612b`). Phase 4
routes goose's provider/credential setup through that same denylist.

## 1. Can config *remove* the excluded vendors, or only default away from them?

**Honest answer: config can only *default away* from them and withhold credentials
— it cannot remove them from the binary.** The OpenAI/xAI/Codex provider code is
compiled in and is even listed over ACP. No config file deletes it.

Alfred therefore makes the excluded vendors **unreachable *through Alfred*** with a
layered chokepoint (`src/lib/goose/`):

1. **Spawn env** (`buildGooseEnv`) — `GOOSE_PROVIDER` pinned to a permitted provider,
   `GOOSE_DISABLE_KEYRING=1`, only the permitted key passed, and ambient excluded
   keys (`OPENAI_API_KEY`, `XAI_API_KEY`, …) **blanked**. The builder **throws** if
   the provider or model resolves to an excluded vendor — Alfred cannot launch goose
   against Meta/OpenAI/xAI.
2. **Isolation** — `GOOSE_PATH_ROOT` points goose at an Alfred-owned root under the
   app config dir, so Alfred **never reads or overwrites the user's shared
   `%APPDATA%\Block\goose` config** (Rule 9 — no silent clobber).
3. **Same denylist** — `gooseProviderVendor()` delegates to `resolveExcludedVendor()`,
   so the app side and goose side can never diverge. The generated `config.yaml`
   refuses to name an excluded provider/model.
4. **UI filtering** — `filterGooseProviderOptions()` removes any excluded id from the
   provider list goose advertises, so the panel never offers one.

**Posture, stated plainly: the goose binary still *contains* the excluded providers'
code (no fork). Alfred neither configures, credentials, nor routes to them, and the
app-side denylist blocks any attempt to.** This is a "present-in-binary but
unreachable-through-Alfred" guarantee, not physical removal.

## 2. What was built

| File | Role |
|---|---|
| `src/lib/goose/provider-lockdown.ts` | **pure** denylist routing + `buildGooseEnv` + `buildGooseConfigYaml` (refuse excluded provider/model; blank ambient excluded keys) |
| `src/lib/goose/acp-client.ts` | spawn `goose acp` sidecar, bridge raw stdio → `ndJsonStream` → `ClientSideConnection`; initialize + `session/new`; **kill-on-exit registry** (window close + `beforeunload`) |
| `src/lib/goose/distribution.ts` | write Alfred's isolated `config.yaml` under `GOOSE_PATH_ROOT` (vault MCP extension + permitted provider) |
| `src/lib/goose/recipes.ts` | `validateRecipe` (`goose recipe validate`) + `runRecipe` (`goose run --recipe … --no-session`, streamed, tracked for kill-on-exit) |
| `src/components/GoosePanel.tsx` | chat view + **xterm.js** terminal; denylist-filtered provider picker; recipe runner; kill on unmount |
| `scripts/stage-goose-sidecar.mjs` | prebuild: compute host triple (`rustc --print host-tuple`), append `.exe` on Windows, copy goose → `src-tauri/binaries/goose-<triple>.exe` |
| `goose-recipes/vault-summary.yaml`, `vault-research.yaml` | sample recipe + a **sub-recipe** (subagent) demonstration |

**Tauri wiring:** `externalBin: ["binaries/goose"]` in `tauri.conf.json`; capability
`shell:allow-spawn`/`allow-execute` scoped to the sidecar with args `["acp"]`,
`["recipe","validate",…]`, `["run","--recipe",…,"--no-session"]`, plus
`stdin-write`/`kill`. Staging runs in `beforeDevCommand`/`beforeBuildCommand`. The
236 MB binary is **git-ignored** (regenerated by the prebuild script), and
`src-tauri/binaries/*` is marked `binary` in `.gitattributes`.

## 3. Vault as a goose extension

The vault is registered as a `type: stdio` goose extension named `alfred-vault` in
Alfred's generated `config.yaml`, launching the Phase-3 MCP server. So goose reads
the vault (hot.md, Memory Bank, notes) as ground truth by default. The
ready-to-paste config for running goose **outside** Alfred is in
[`docs/mcp-server.md`](../mcp-server.md); the in-app integration is in
[`docs/goose.md`](../goose.md).

## 4. Subagents

goose subagents are a **core capability invoked via natural-language delegation**
(no builtin to enable; subagents inherit the session's extensions and can run in
parallel). `goose-recipes/vault-research.yaml` demonstrates the **sub-recipe** path
(`sub_recipes:`), which runs an isolated subagent for the vault summary while
keeping the main context clean. Subagent activity surfaces in the panel via ACP
`session/update` notifications (tool-call updates → the terminal pane).

## 5. Verification

- `npm run verify:all` — **green** (typecheck, typecheck:mcp, all tests, L1+L2
  exclusion gate, `build` + `build:web`).
- `cargo check` (src-tauri) — **green**: the new capability + `externalBin` validate.
- **ACP handshake (live, real goose 1.39.0)** — `src/lib/goose/acp-handshake.test.ts`:
  `initialize` → protocolVersion 1, agentInfo `goose`; `session/new` → a session id;
  and the advertised provider list **contains** `openai`/`xai` while
  `filterGooseProviderOptions` **removes** them. The child is killed in `finally`.
- **Excluded-provider refusal (Alfred's layer)** — `src/lib/goose/provider-lockdown.test.ts`:
  every excluded goose id (`openai`, `azure_openai`, `chatgpt_codex`, `codex`,
  `codex-acp`, `xai`, `xai_oauth`) is refused; permitted ids incl. Mistral,
  OpenRouter, Ollama/local, and even `nano-gpt` are accepted; `buildGooseEnv`/
  `buildGooseConfigYaml` throw for an excluded provider/model.
- **Recipe validation (live)** — `src/lib/goose/recipes.live.test.ts`: both shipped
  recipes pass `goose recipe validate` (exit 0).
- Tests gate on the goose binary being present (`describe.skipIf`) so CI without
  goose stays green; they run live on the build machine.

## 6. Honest limitations / follow-ups (flagged, not silently done)

- **MCP server still runs via `tsx`.** The generated `config.yaml` launches the
  vault extension with `npx tsx <vault>/mcp/run.ts`. Bundling a compiled/standalone
  MCP server alongside the sidecar (so a packaged app needs no repo checkout) is the
  deferred Phase-3 item — **flagged, not done** (extra scope). Tracked for a
  follow-up.
- **Model-calling paths are key-gated.** `initialize`, `session/new`, and
  `recipe validate` are verified headlessly (no key). Actually *prompting* the model
  (goose answering from the vault; a recipe executing end-to-end) needs a provider
  key and is verified manually / by an opt-in run — the plumbing (env, MCP
  extension, streaming, kill) is in place and unit/integration-tested up to the
  model boundary.
- **Orphaned goose on abnormal app exit (Windows) — HANDLED: Job Object kill-on-close.**
  `src/job_guard.rs` binds Alfred to a Windows **Job Object** with
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, wired as the **first** call in `run()` (before
  `tauri::Builder`, so even startup-phase crashes are covered). Every process Alfred
  spawns — the goose `acp` sidecar and its whole descendant tree — inherits the job;
  when the last handle to the job closes, which the OS does automatically on **any**
  parent exit (crash, SIGKILL, Task Manager — where the graceful JS hooks never run),
  the OS kills every remaining job member. **No orphans.** Verified by a behavioral
  test (`src/job_guard_tests.rs`): an independent kill-on-close job + a long-lived
  member child → closing the job handle kills the child within 5 s. Degrades
  gracefully (logs a warning and keeps running) if the process is already in an
  incompatible job. The graceful JS hooks in `acp-client.ts` remain the fast path for
  normal shutdown; the Job Object is the backstop for abnormal death. The dep is
  Windows-only (`[target.'cfg(windows)'.dependencies] windows = "0.61"`); non-Windows
  builds don't see it.
- `ClientSideConnection` is `@deprecated` upstream (still functional). Migration to
  `client().connectWith()` is a low-risk future cleanup.

## 7. Constitution check

- **Vendor exclusion (rule 2):** denylist enforced on both the app and goose sides;
  no Meta/OpenAI/xAI dependency, import, endpoint, or **configured** provider.
  Present-in-binary code is documented and unreachable through Alfred.
- **No fork:** AAIF / Linux Foundation provenance accepted (decided with the builder).
- **Rule 9:** `GOOSE_PATH_ROOT` isolation avoids clobbering the user's goose config;
  keys are env-only and never logged or persisted by goose; the sidecar binary is a
  local staging step, not committed; no pushes without go-ahead.
- **Dependency added:** `@agentclientprotocol/sdk@^1.0.0` (Apache-2.0) — named in the
  phase plan. L1+L2 exclusion gate clean after install.
