# LOOP-INTEGRATION.md — Alfred × Holmes Stage 1 integration loop (working ledger)

**Session:** 2026-07-22, Linux remote container, branch `claude/holmes-stage1-integration-zim9m4`
off post-merge main `8a55c9c` (beta.3 set merged via PR #20). Work order:
`alfred-holmes-integration-brief.md` (root, landed `1ad85ba`). Execution protocol: the Stage-1
integration prompt. Constitution: `CLAUDE.md`. Conventions as LOOP-DESIGN.md: items, evidence per
item as command → salient output, honest-skip surfacing. Evidence classes: EXECUTED /
VERIFIED-LIVE / CANON / REPORTED / UNVERIFIED.

**Environment premise (carried to every line):** container lacks `gdk-3.0`/`webkit2gtk`
(`pkg-config --exists` EXECUTED 2026-07-22: glib OK, gdk-3.0 MISSING, webkit2gtk MISSING) →
`cargo test` for src-tauri and `tauri build` route to CI (rust job installs GTK). Goose sidecar
not staged here → live-goose trio routes to Windows/release lane. Platform repo cloned as sibling
`../wecanjustbuildthings.dev` exactly as ci.yml does (`git clone --depth 1` + `npm ci
--ignore-scripts`) — exclusion gates EXECUTED locally. Holmes cloned read-only at the pinned rev
`63f877a7399bee0d34b10fed08e35e87a434cd73` (== `MartinMontero/Holmes` main).

---

## STEP 0 — RECON (all verdicts before any edit)

### Merge gate — PASSED (EXECUTED)

| Anchor | Evidence |
|---|---|
| `lighthouserc.json` numberOfRuns 3 + median | `grep` → `"numberOfRuns": 3`; four assertions carry `"aggregationMethod": "median"` |
| `src/lib/vault-line.ts` exists | `ls` → present |
| version reads 0.1.2 | package.json:3 + src-tauri/tauri.conf.json:4 both `"version": "0.1.2"` |
| `docs/decisions/0007-*` present | `0007-interactive-icon-contract.md` listed; next free ADR = **0008** |

### Baselines at HEAD (pre-edit)

| Baseline | Result | Class |
|---|---|---|
| `tsc --noEmit` | exit 0 | EXECUTED |
| vitest | **321 passed \| 4 skipped** (35 files passed, 3 skipped) — matches protected baseline | EXECUTED |
| contrast | `node scripts/check-contrast.mjs` → **33/33 PASS**, "All pairs meet WCAG AA (4.5:1)" | EXECUTED |
| cargo (src-tauri, 12 tests) | container-blocked (gdk-3.0 missing) → routes to CI rust job | HONEST-SKIP → CI |
| CI on main `8a55c9c` | run 29876250457 completed **success** | VERIFIED-LIVE |
| Holmes workspace tests at pin | `cargo test --locked` in the clone → all green, exit 0 (Rust 1.94.1) | EXECUTED |

### Holmes cross-repo obligations table (STATE.md, verbatim — CANON)

| Obligation | Status |
|---|---|
| Artifact-level guard CI test (runs in Alfred's CI) | OPEN — [DIRECTIONAL] |
| OS/artifact-level egress enforcement (L1a residual: hostile binary ignoring proxy env) | OPEN — restated in `holmes-guard` docs + `docs/security.md` |
| Signed update channel with rollback | OPEN — [DIRECTIONAL] |
| Memory/resurfacing channel | OPEN — [DIRECTIONAL] |
| First-run rendering (tool-approval UX surface) | OPEN |
| `holmes-guard` adoption retiring `provider-lockdown.ts` | OPEN — adoption surface now real: `policy::PROVIDER_SELECTING_ENV_VARS`, `spawn::sanitized_spawn`, readable policy tables |
| Freshness note: `src/lib/provider-policy.test.ts` stale model-id fixtures | NOTED 2026-07-18 — cosmetic |

Holmes STATE.md header (CANON): D-14 = **Option A (analytical open beta) DECIDED (Martin,
2026-07-20)**; Phase 4 closed (lock 4b 6/6 HELD); riders (a) investigative absent / (b) plain
beta-scope copy verified Holmes-side. Live-goose smoke Holmes-side ran against goose v1.43.0
(`aaif-goose` @ `8e78960e`) — flag 4 below.

### The six flags — settled (none discovered mid-refactor)

| Flag | Verdict | Evidence |
|---|---|---|
| 1 — web-build policy | **(a) web has NO provider egress — record it, nothing to enforce.** No ADR needed. | EXECUTED: `src/platform/web/ai.ts` is a pure throwing stub (all four methods `notImplemented()`); the only `fetch(` in src/ is `nostr/nip05.ts` (NIP-05, not AI); agent/chat surfaces desktop-gated; recon agent C corroborates 3 independent layers (build-time platform switch, stubs, capability gating) |
| 2 — pin discipline | Dep form fixed: `git = "https://github.com/MartinMontero/Holmes.git", rev = "63f877a7399bee0d34b10fed08e35e87a434cd73"` (full SHA = today's main). Builds `--locked` after one deliberate lock-regen commit. Re-pin to the RC tag when cut = its own commit. | EXECUTED (dep screen below) |
| 3 — artifact-platform honesty | Track-2 job exercises the **Linux** artifact and must say so in the job summary; required-check click on main = Martin's. Windows release-lane probes: wired or ledgered (see Track 2). | Design recorded; execution in Track 2 |
| 4 — goose version skew | Alfred stages **1.41.0** (`scripts/stage-goose-sidecar.mjs` `EXPECTED_GOOSE_VERSION = '1.41.0'`; release.yml `GOOSE_VERSION: '1.41.0'`); Holmes verified spawn/L1b against **1.43.0**. Not runnable here (no sidecar, no GTK) → live verification of the new spawn path against staged 1.41.0 **routes to Windows/release lane by name**. Bump to 1.43.0 = separate Martin decision (NOT taken this loop). Skew bite points enumerated: permission.yaml 3-list schema, setSessionMode 'approve' id, advertised-provider-id list, "all providers compiled in" fact, CLI args. | EXECUTED (greps) + REPORTED (Holmes 1.43.0 leg) |
| 5 — the 32 refusal tests survive | Full enumeration done pre-deletion: provider-lockdown.test.ts = **32** cases, provider-policy.test.ts = **30**, config-scan.test.ts = **4**, ai-credentials.fp.test.ts = 1 mega-test / **40 table rows** (12 must-block, 25 must-allow, 3 llama-on-permitted-infra), plus 2 live tests (acp-handshake, permission-startup) importing lockdown builders. Mapping table ships in PR 1 body + `docs/audit/holmes-stage1-track1-mapping.md`. | EXECUTED (enumeration in recon; mapping in Track 1) |
| 6 — exclusion engine vs crate literals | **Gates green with the dep resolved.** L1+L2 blocking: EXECUTED on the dep-screen branch → "6 manifests clean" / "2 lockfiles clean", passed. L3 advisory: 23 hits, ALL in the existing TS policy layer (provider-policy.ts/.test.ts, provider-lockdown.ts/.test.ts, config-scan.test.ts, ai-credentials.fp.test.ts) — the exact files Track 1 deletes; crate source lives in the cargo cache outside `--tree .` scan scope and carries no excluded-vendor manifest provenance. **No platform-repo exemption decision needed.** | EXECUTED |

### Dependency screen (EXECUTED, scratch branch, then reverted)

`cargo tree -p holmes-guard -p holmes-core` with the pinned git dep resolved: **zero new
third-party packages** — `git diff Cargo.lock` shows exactly two new `[[package]]` entries,
`holmes-core` and `holmes-guard` (holmes-core depends on holmes-guard; diff saved during recon).
License: both crates inherit workspace `license = "AGPL-3.0-or-later"` — no seam with Alfred.
Both crates: no serde, no third-party deps by design (Cargo.toml comments verbatim); edition
2021; no rust-version pin, de-facto MSRV ~1.74 (`io::Error::other`) < Alfred's 1.77.2. Holmes
workspace tests pass in this container at the pin (exit 0).

### TS/JS policy-site inventory → Track-1 disposition

| File | Role | Disposition |
|---|---|---|
| `src/lib/provider-policy.ts` | app-side denylist source of truth (tables + resolve/check/assert) | **DELETE**; agentic surface → crate L1b; Direct Chat surface → compiled Rust `direct_chat_policy` (ADR-0008 §two-regime) |
| `src/lib/provider-policy.test.ts` (30) | pins denylist semantics incl. denylist-not-allowlist proof | DELETE after mapping → Rust tests (per-surface) |
| `src/lib/goose/provider-lockdown.ts` | goose chokepoint: env builder, config-yaml writer, ACP filter, B5 scanner | **DELETE** (the brief's named deliverable); replaced by crate `sanitized_spawn` + Rust seam |
| `src/lib/goose/provider-lockdown.test.ts` (32) | refusal/env/config pins | DELETE after mapping → Rust guard-seam tests |
| `src/lib/goose/config-scan.test.ts` (4) | B5 scanner pins | DELETE after mapping → Rust B5 tests (crate-primitive scan, documented residual) |
| `src/lib/ai-credentials.fp.test.ts` (40 rows) | false-positive suite (llama-on-permitted-infra etc.) | DELETE after mapping → Rust direct-chat fp tests (semantics preserved on the Direct Chat surface; agentic surface narrows per ADR-0008) |
| `src/lib/goose/distribution.ts` | prepare isolated GOOSE_PATH_ROOT + config/permission yaml + B5 warnings | Replaced by Rust prepare inside the spawn seam |
| `src/platform/tauri/ai.ts` | assertProviderAllowed before custom_provider_* invokes | Thin pass-through; enforcement moves INTO the Rust commands |
| `src/platform/web/ai.ts` | throwing stubs | Unchanged (flag 1a) |
| `src/components/GoosePanel.tsx` | UI list via filterGooseProviderOptions over curated 5 | Reads crate roster via Tauri command |
| `src/lib/goose/acp-client.ts` / `recipes.ts` | spawn sites (plugin-shell sidecar) | Spawn moves behind Rust seam (`sanitized_spawn`); stdio bridged via IPC channel |
| `src/lib/ai-credentials.ts` | credentials + dead policy re-exports | Keep credential fns; strip policy re-exports |
| `src/lib/agentic/memory-review.ts` | SUSPICIOUS-pattern regex over memory text | Unchanged (gates memory text, not providers) |
| `src-tauri/src/lib.rs` custom_provider_request/stream/list_models | **ZERO Rust-side screening today** (reqwest to any URL) — the strippable-TS hole, verbatim per brief §"why now" | Gains compiled screening (Track 1) |

### STEP 0 finding — policy-semantics divergence (the load-bearing one, routed to ADR-0008)

The crate is a **deny-by-default allowlist**: `PERMITTED_PROVIDERS` =
anthropic/google/deepseek/qwen/mistral/ollama; `EXCLUDED_PROVIDERS` includes **openrouter and
litellm** ("vendor-reaching intermediaries"); `PERMITTED_MODEL_FAMILIES` per provider (anthropic
`claude-`, google `gemini-`/`gemma`, deepseek `deepseek-v`, qwen `qwen`, mistral
`mistral/magistral/ministral`, ollama `qwen/gemma/magistral/mistral`); `excluded_model_token`
denies `llama` anywhere (ollama carve-out only). Alfred's current TS canon (CLAUDE.md DECISIONS +
ADR-0004 + the fp suite) is allow-by-default with a 3-vendor denylist: openrouter permitted,
llama-family ids on permitted infra pinned ALLOWED, `ollama/deepseek-r1` allowed. **Adopting the
crate narrows the agentic surface** (drops openrouter, groq/together/lmstudio/etc. goose ids,
llama-family and non-family models). The brief's own Track-1 test list matches the crate's set —
the brief governs scope — so Track 1 builds crate-as-truth on the **agentic (goose) surface**,
and the narrowing is stated in full in ADR-0008; **Martin's merge of PR 1 is the ratification**.
The **non-agentic Direct Chat** surface (ADR-0004: KEEP, "wire format ≠ vendor" binding) keeps
Alfred canon denylist semantics, with enforcement moved from strippable TS into compiled Rust
inside the `custom_provider_*` commands. Evidence class: EXECUTED (policy.rs / resolution.rs /
spawn.rs / proxy.rs read in full this session).

### Track-2 feasibility (STEP 0 item 6)

CI has **no Linux `tauri build`** today (rust job = cargo test only); release lane =
windows-latest tauri-action. The built binary has no CLI/headless probe surface, and (pre-Track-1)
all refusal logic is TS-in-webview — hence Track 1 lands first, moving refusals into the compiled
artifact, then Track 2 exercises the **built product** under `xvfb` with **tauri-driver** (named
in CLAUDE.md's tooling table as the sanctioned optional E2E instrument) + a controlled sidecar
next to the built binary (placeholder pattern already exists in ci.yml). No product-code test
hook is compiled into the shipped artifact (that would be a Martin GATE — not needed under this
design). Probe (b) honesty: a planted hostile config **cannot select a provider** under
`sanitized_spawn` (env wins; wholesale env_clear); the job asserts exactly that plus the surfaced
warning — "refused" in effect, stated precisely in the job summary.

### Track-3/4 recon facts

- Born-redacted spine: `src-tauri/src/telemetry.rs` — structural typed allowlist (counts,
  durations, booleans, enums, stable ids; no content field exists); canary
  `born_redacted_canary_no_secret_or_note_body_on_disk` in `telemetry_tests.rs` with a raw-write
  control db guarding against blind-scan false negatives. EXECUTED (read in full).
- OS-level around goose: Windows Job Object kill-on-close (`job_guard.rs`) = lifecycle only; no
  OS-level egress enforcement exists anywhere in the tree (grep firewall/iptables/seccomp/egress:
  none). Track 3(2) will ledger the gap.
- holmes-core Track-4 surface: no serde anywhere (zero third-party deps by design) → Alfred-side
  serde DTOs mapped via getters; sealed types (ToolGrant, ConsentRecord, TargetingAllowed,
  EmittedEvidencePack, ApprovalRequest.decision) cannot be reconstructed from JSON — live state
  (AnalyticalCase, ApprovalProtocol, EgressProxy) lives in Tauri managed state; only DTO
  snapshots cross IPC. The render projection accepts `&EmittedEvidencePack` only — the
  proof-of-gate property survives the boundary by construction.

---

## HONEST LIMITS (verbatim, carried to release notes)

The guard governs Alfred's own sessions — a user's separately installed stock goose is theirs;
AGPL forks can strip anything — governance, not the binary, answers for forks; nothing in this
loop claims otherwise anywhere.

---

## TRACK ENTRIES (appended per track)
