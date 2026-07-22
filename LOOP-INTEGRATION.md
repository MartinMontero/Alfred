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

### TRACK 1 — adopt the guard, retire the TS one (PR 1) — DONE, awaiting Martin's merge

Compiled `holmes-guard` + `holmes-core` adopted (ADR-0008, Proposed). The agentic
(goose) surface now routes every spawn through the Rust guard seam
(`src-tauri/src/guard.rs`): L1b `resolution::resolve`, L2 `spawn::sanitized_spawn`,
in-process L1a `proxy::EgressProxy`. The UI reads the permitted roster from the crate
(`guard_permitted_providers`). The Direct Chat (non-agentic) surface keeps Alfred's
canon denylist, moved from strippable TS into compiled Rust
(`src-tauri/src/direct_chat_policy.rs`) inside the `custom_provider_*` commands.
`provider-lockdown.ts`, `provider-policy.ts`, `distribution.ts` — **deleted**.

Security tightening (required, not incidental): the webview's `shell:allow-spawn` /
`allow-execute` / `allow-stdin-write` / `allow-kill` sidecar permissions for goose were
removed from `capabilities/default.json`. Goose is now Rust-spawned; leaving those would
let a compromised webview launch goose directly and bypass L1a/L1b/L2. The guard is now
the only path to a goose process.

| item | status | evidence class | proof (command → output / file:line) |
|---|---|---|---|
| Pinned dep added (flag 2) | DONE | EXECUTED | `src-tauri/Cargo.toml` `holmes-guard`/`holmes-core` `rev = "63f877a…"`; `cargo tree` → zero new third-party crates |
| L1b routing via Tauri seam | DONE | EXECUTED | `guard::guard_resolve` / `guard_spawn_goose`; `guard_tests::l1b_*` (5 tests) green |
| UI reads roster from crate | DONE | EXECUTED | `guard::guard_permitted_providers`; `GoosePanel.tsx` `onMount` reads it; `For each={providers()}` |
| Every goose spawn via `sanitized_spawn` (L2) | DONE | EXECUTED | `guard::build_goose_spawn` for acp + recipe validate + recipe run; `guard_tests::l2_*` (6 tests) |
| L1a proxy env on spawned sessions | DONE | EXECUTED | `GuardState::proxy_addr` → `EgressProxy::spawn`; `l2_builds_a_locked_down_env…` asserts HTTP(S)_PROXY pinned, NO_PROXY absent |
| Direct Chat policy compiled (flag 1 regime B) | DONE | EXECUTED | `direct_chat_policy.rs`; `ensure_endpoint_allowed` in all three `custom_provider_*` commands; `direct_chat_policy_tests` (17) green |
| Refusal-test intent ported (flag 5) | DONE | EXECUTED | mapping table: `docs/audit/holmes-stage1-track1-mapping.md`; 70 removed TS tests → 50 Rust tests + Track-2 |
| `provider-lockdown.ts` deleted | DONE | EXECUTED | `git rm` executed; `grep -r provider-lockdown src/` → only the mapping doc references it |
| release-mode Rust tests | DONE | EXECUTED | `cargo test --lib --release` → **50 passed; 0 failed** |
| spawn path launches a real process (flag 4 container stand-in) | DONE | EXECUTED | `guard_tests::l2_built_command_actually_spawns_a_process_with_the_sanitized_env` (unix-gated) → spawn Ok, sanitized env applied |
| live-goose connection against staged 1.41.0 | ROUTED | HONEST-SKIP → Windows | no sidecar + no goose in container; routes to Windows/release lane (flag 4). Bump to Holmes-verified 1.43.0 = separate Martin decision, NOT taken |
| capability surface tightened | DONE | EXECUTED | `capabilities/default.json`: goose shell sidecar perms removed; `cargo test` compiles (generate_context validates the ACL) → 50 passed |
| typecheck | DONE | EXECUTED | `tsc --noEmit` → exit 0 |
| vitest (mapping-accounted) | DONE | EXECUTED | **252 passed \| 2 skipped**; delta 321\|4 → 252\|2 fully mapped (70 removed → Rust; 2 skips superseded; +1 added) |
| exclusion L1/L2 (flag 6) | DONE | EXECUTED | `npm run check:exclusion` → "6 manifests clean" / "2 lockfiles clean", passed with dep resolved |
| exclusion L3 (flag 6) | DONE (advisory, as before) | EXECUTED | 17 hits, all in `direct_chat_policy*.rs` + `guard*.rs` (the compiled denylist + its tests) — same advisory class the deleted TS files carried, **count down 23 → 17**; `|| exit 0`, non-blocking in CI; NO platform-repo exemption needed |
| zero-Soapbox | DONE | EXECUTED | `grep -riE 'soapbox\|@nostrify'` → clean |
| tauri-align | DONE | EXECUTED | "All 12 tauri Rust/JS pairs aligned" |
| build (vite desktop) | DONE | EXECUTED | `npm run build` → "✓ built in 19.74s" |
| build:web (PWA) | DONE | EXECUTED | `npm run build:web` → "PWA … files generated" |
| clippy on new modules | DONE | EXECUTED | `cargo clippy --lib` → 0 warnings in guard.rs/direct_chat_policy.rs (4 pre-existing lib.rs warnings untouched) |

**Flag 4 note:** Alfred stays on staged goose **1.41.0**. The guard's spawn/handshake
class is Holmes-verified against 1.43.0; the container cannot run goose (no sidecar, no
staged binary) so Alfred's own live check routes to the Windows release lane. Bumping the
pin to 1.43.0 is a separate Martin decision — recorded, not taken.

### TRACK 2 — the artifact-level guard test: the Holmes RC unblock (this PR) — DONE

New CI job `artifact-guard` (`.github/workflows/ci.yml`): builds the **actual release
artifact** (`tauri build --no-bundle`) and drives it under WebDriver (tauri-driver 2.0.6 +
WebKitWebDriver, headless via xvfb), exercising the compiled guard through the artifact's
own IPC. Probe script: `scripts/artifact-guard-probe.mjs`. **A crate unit test does not
count — the subject is the built binary.**

**Executed locally against the real built binary** (`src-tauri/target/release/alfred`,
16.9 MB, built in-container after the announced GTK install) — **15 passed, 0 failed, 0
skipped**:

```
GOOSE_PROVIDER=openai OPENAI_API_KEY=hostile-ambient-key XAI_API_KEY=hostile-xai \
  xvfb-run -a node scripts/artifact-guard-probe.mjs src-tauri/target/release/alfred
PASS  artifact launches and exposes IPC under WebDriver
PASS  compiled roster is exactly the guard-permitted six — ["anthropic","google","deepseek","qwen","mistral","ollama"]
PASS  (a) L1b in the artifact refuses provider openai — "excluded by the compiled denylist"
PASS  (a) L1b in the artifact denies unknown provider ids (deny-by-default) — lmstudio
PASS  (a) a spawn demanding openai is refused by the artifact
PASS  (a) Direct Chat in the artifact refuses an OpenAI endpoint
PASS  (a) Direct Chat in the artifact refuses an xAI endpoint
PASS  Direct Chat screen passes a permitted local endpoint (fails later on connect, not policy)
PASS  (c) a permitted provider spawns through the artifact — {id:1, model:"qwen2.5", …}
PASS  (b) the planted hostile config is surfaced as a B5 warning, not silently honored
PASS  (c) the goose child actually ran (env dump written by the stub)
PASS  (a) hostile ambient OPENAI_API_KEY did NOT reach the goose child (env cleared wholesale)
PASS  (b) the child provider is the permitted one — the planted config selected nothing — GOOSE_PROVIDER=ollama
PASS  (a) the child egress is pinned to the in-process L1a proxy — HTTPS_PROXY=http://127.0.0.1:42463
PASS  the child runs keyring-free with the isolated goose home
15 passed, 0 failed, 0 skipped
```

| item | status | evidence class | proof |
|---|---|---|---|
| Build the actual release artifact | DONE | EXECUTED | `npm run tauri build -- --no-bundle` → "Built application at: …/target/release/alfred" (6m21s) |
| (a) excluded-provider env → refused | DONE | EXECUTED | probe: L1b + spawn + Direct Chat OpenAI/xAI all refused; hostile ambient `OPENAI_API_KEY` cleared from child |
| (b) planted hostile config → refused-in-effect | DONE | EXECUTED | probe: config surfaced as B5 warning AND child `GOOSE_PROVIDER=ollama` (config selected nothing) |
| (c) permitted provider → works | DONE | EXECUTED | probe: `guard_spawn_goose` ollama/qwen2.5 → session id 1, stub child ran |
| L1a egress pin on the shipped artifact | DONE | EXECUTED | probe: child `HTTPS_PROXY=http://127.0.0.1:<ephemeral>`, `NO_PROXY` absent |
| CI job wired (Linux) | DONE | EXECUTED | `ci.yml` job `artifact-guard`; tauri-driver pinned 2.0.6 `--locked` |
| CI run green on the branch/main | PENDING-CI | UNVERIFIED → will link | run URL captured after push below |
| required check on main | GATE-Martin | — | branch-protection click is Martin's; **prepare + request at gate** |
| platform honesty (flag 3) | DONE | EXECUTED | job summary states it exercises the **Linux** artifact; Windows artifact probe = ledgered follow-up (needs msedgedriver + sidecar-next-to-exe on a Windows runner); `release.yml` + `docs/release-process.md` corrected (deleted permission-startup/acp-handshake no longer claimed) |

**THE UNBLOCK (loud, for cross-linking into Holmes STATE.md):** the artifact-level guard
test is green against Alfred's real built binary. CI run URL on Alfred main lands once
Martin merges this PR; the local execution above is the same job, same probe, same binary
class. **The Holmes STATE.md cross-link edit is Holmes-side — this loop delivers the URL,
does not touch the Holmes repo.**

**Windows-probe follow-up (ledgered, flag 3):** the probe script is already platform-aware
(msedgedriver + `goose.exe` stub + `%APPDATA%` config dir); wiring it into `release.yml`
against the shipped Windows `.exe` needs a Windows runner to develop the msedgedriver path
and place the staged sidecar next to the raw exe. Until then: the Linux job is the binding
per-push proof (identical compiled guard), the Rust `guard_tests` cover spawn/env, and
`recipes.live` exercises the real Windows sidecar in the release lane.

**★ RC-UNBLOCK URL (green on Alfred `main`) ★**
`https://github.com/MartinMontero/Alfred/actions/runs/29883979445/job/88810606926`
— the `artifact-guard` job on main (merge commit `513a34e`), conclusion **success**: the
"Build the release artifact (tauri build)" step and the "Artifact-level guard probe (hostile
env, planted config)" step both green. **This is the single link Holmes `STATE.md` cross-links
to flip Holmes RC from BLOCKED.** Delivered here; the Holmes-side `STATE.md` edit is Holmes's
(this loop does not touch the Holmes repo). PR #22 run (pre-merge, same content):
`…/runs/29883573480/job/88809385185`, also success.

### TRACK 3 — perimeter remainder, items (2)(3)(4) (this PR) — DONE / one PENDING-Martin by design

| item | status | evidence class | proof |
|---|---|---|---|
| **(2) OS/artifact-level egress** | GAP-LEDGERED (honest) | EXECUTED (reads) | **Exists:** the in-process L1a proxy (`guard.rs` `GuardState::proxy_addr` → `EgressProxy::spawn`) with the goose child's `HTTP(S)_PROXY` pinned to it and `NO_PROXY` cleared (`sanitized_spawn`; proven by the artifact probe: child `HTTPS_PROXY=http://127.0.0.1:<ephemeral>`). This is a **cooperative-process** control. **Gap (ledgered, not closed):** no OS-level egress enforcement exists in the tree (`grep firewall\|iptables\|seccomp\|namespace\|WFP` → none; `job_guard.rs` is lifecycle kill-on-close, not egress). The crate's own honest residual holds verbatim: *"a hostile binary that ignores proxy environment variables escapes this library-level boundary"* (`holmes-guard/src/proxy.rs`). OS-level egress (WFP on Windows / netns on Linux) is a **ledgered future work item**, not a beta deliverable. No silent middle. |
| **(3a) signed update channel** | VERIFIED | REPORTED (Martin, live) | `tauri.conf.json` updater endpoint `https://github.com/MartinMontero/Alfred/releases/latest/download/latest.json`, pubkey present, `createUpdaterArtifacts: true`. Flow = three explicit user consent steps, signature-verify-then-install, never automatic (`src/lib/updater.ts`, `Settings.tsx`). Martin's live intake (LOOP.md:628-630): *"Update feed VERIFIED-LIVE: GET releases/latest/download/latest.json → HTTP 200, version 0.1.1, minisign signature embedded"* (beta.2 published 2026-07-19). |
| **(3b) rollback exercise** | PENDING-Martin | REPORTED (partial) | Rollback checklist authored for Martin: `docs/beta/rollback-checklist.md` — consistent with the comparator rule (rollback = higher-numbered release carrying prior code) and journey J6 (updater dry-run against a **local** `latest.json`, no live publish). Status stays PENDING-Martin until his beta.2→beta.3 live update-cycle walk + a rollback dry-run land; then VERIFIED in both ledgers. **This item gates the beta.4 publish.** |
| **(4) memory/resurfacing channel** | VERIFIED | EXECUTED (reads) | Born-redacted **by construction**: `telemetry.rs` `TelemetryEvent` is a typed allowlist — counts/durations/booleans/enums/stable ids only, **no field for a note body / prompt / tool arg / key / file content** (module doc: *"redaction is structural … such data cannot be written"*). Canary `born_redacted_canary_no_secret_or_note_body_on_disk` scans the db + WAL/SHM with a raw-write control guarding against a blind scan (`telemetry_tests.rs`; green in the 50-test cargo run). Live tap `session-tap.ts` reads ONLY bounded scalars/ids (ToolKind, stopReason, toolCallId, clock) — content-bearing ACP fields never enter an event; inert unless telemetry opted in; one writer (`telemetry_record`). Memory-proposal gate `memory-review.ts` is **proposal-only** (`auto-promote` only for clean user-authored facts; agent-authored → `needs-review`; obfuscation/policy-tamper → hard `reject`) with a `POLICY_TAMPER` regex guarding the lockdown. |

**Loop-E sentence (recorded, per the brief):** Holmes's Loop E later rides **this** born-redacted
memory/telemetry channel and is granted **no new one** — the typed-allowlist store + the
single-writer `telemetry_record` command is the only resurfacing surface.

### TRACK 4 — embed the analytical surface, D-14 Option A (this PR) — DONE

The compiled analytical projection (`src-tauri/src/analytical.rs`, 11 tests) + the lab-register
render surface (`src/components/AnalyticalPanel.tsx`, `src/lib/analytical.ts`, 4 helper tests),
wired into the shell as the **Evidence** nav item (desktop-gated).

| item | status | evidence class | proof |
|---|---|---|---|
| Flow: operator brief → ResearchBrief → emission gate → render | DONE | EXECUTED | `analytical_emit`: operator brief → `ResearchBrief::new` → `EvidencePack` → `emission::emit` (the real lock-1a + lock-2.5b gate). `emit_produces_a_rendered_pack_with_every_honesty_field` green |
| **Render ONLY EmittedEvidencePack** (compiler-backed) | DONE | EXECUTED | `EmittedPackDto::from_emitted(&EmittedEvidencePack)` is the sole constructor — no `from_pack`; a raw pack has no render path. The boundary gate forbids `from_pack` / `EmittedEvidencePack::pack(&` / sealed struct literals |
| Render the honesty untruncated | DONE | EXECUTED | knowability, the three-part limits, uncertainty, `[eliminated]` labels, risk flags, recommendation all project to the DTO and render (`AnalyticalPanel.tsx`); `limitsSections`/`isEliminated`/`hypothesisText` tests pin no-truncation |
| Gate denials rendered, not swallowed | DONE | EXECUTED | `EmitOutcome::Denied { reason, class }` surfaced verbatim in UI; `emit_surfaces_the_uncorroborated_denial_verbatim`, `emit_denies_confident_uncalibrated_and_names_the_remedy`, `emit_denies_missing_limits` |
| Approval (2.5c): preview via ActionPreview; grants mint from operator approval | DONE | EXECUTED | `analytical_preview_approval` grants nothing; `analytical_decide_approval` — Approved→one grant/tool, Denied→zero (`approved_mints_one_grant_per_tool_denied_mints_zero`); ToolGrant sealed, minted only here |
| Consent (2.5d): mints only from operator UI | DONE | EXECUTED | `analytical_record_consent` (empty reference refused as forgery), `analytical_assess_targeting` (private individual refused permanently) — never from case content; `consent_mints_only_*`, `targeting_refuses_a_private_individual_permanently` |
| Reader separation honored (documented) | DONE | CANON | no live quarantined reader ships this beta (investigative absent); the in-process trust limit is documented in Holmes `docs/security.md` and the separate-no-tools-process rule holds when it runs — not enabled here |
| Rider (a): investigative feature absent, grep-proven | DONE | EXECUTED | Alfred's `holmes-core` dep enables no features (`cargo tree -f` → `default` only); compile-time `const _: () = assert!(holmes_core::observability::INVESTIGATIVE_ABSENT)` in `analytical.rs` breaks the build if ever enabled |
| Rider (b): beta copy states investigative not shipped | DONE | EXECUTED | steward-register sentence in `AnalyticalPanel.tsx` (where testers see it), `README.md`, and `docs/beta/known-issues.md` ("Investigative mode is not shipped this beta") |
| Boundary check (Alfred-side, CI-cheap) | DONE | EXECUTED | `scripts/check-guard-boundary.mjs` (self-tested: catches quarantine-accessor + sealed-literal); `npm run check:guard-boundary` in `verify:all` + a blocking `ci.yml` step; **clean over 198 files** |
| Lab register (0006) + two-layer rule (0005) | DONE | EXECUTED | muted-steel `--reg-evidence-accent`, verdict-first, no glow/violet; `knowabilityLabel` test asserts no loop/build vocabulary in UI copy |
| typecheck / vitest / builds / cargo | DONE | EXECUTED | tsc 0; vitest **256 passed \| 2 skipped**; both builds green; cargo **61 passed** (12 + 38 guard + 11 analytical) |

**Deliberate beta scope (stated, not a gap):** the six-phase `AnalyticalCase` collection machine
(live tools, the quarantined reader) is **not** driven — that IS the investigative/collection
surface rider (a) keeps absent. The beta ships the emission gate + honest rendering + the
approval/consent operator patterns. The direct-`emit()` path runs the identical gate the case
machine's `resolve()` calls, so the honesty guarantees are the same.


---

## STAGE 1 CLOSE — verdict table + gate handoff

### The four Holmes cross-repo obligations (brief §7 definition of done)

| Obligation | Verdict | Linked evidence |
|---|---|---|
| 1. Artifact-level guard CI test (RC unblock) | **VERIFIED** | `artifact-guard` green on main: `…/runs/29883979445/job/88810606926` (tauri build + guard probe, 15/15 locally). Required-check click is Martin's (gate below). |
| 2. OS/artifact-level egress enforcement | **VERIFIED-with-honest-residual** | L1a proxy env pinned on the shipped artifact (probe: `HTTPS_PROXY=http://127.0.0.1:<ephemeral>`, `NO_PROXY` absent); the documented residual (hostile binary ignoring proxy env) is ledgered as future OS-level work, not closed — Track 3(2). |
| 3. Signed update channel with rollback | **VERIFIED (channel) · PENDING-Martin (rollback exercise)** | channel live + minisign-signed (Martin's beta.2 intake, LOOP.md:628-630); rollback checklist authored (`docs/beta/rollback-checklist.md`); the rollback dry-run walk is Martin's. **Gates the beta.4 publish.** |
| 4. Memory/resurfacing channel | **VERIFIED** | born-redacted typed allowlist (`telemetry.rs`) + canary + single-writer; `session-tap.ts` reads only bounded scalars; `memory-review.ts` proposal-only. Loop E rides this channel, no new one. |

### Stage-1 done-when (brief §7) — status

- ✅ `provider-lockdown.ts` no longer exists (deleted, Track 1).
- ✅ the artifact-level test is green on Alfred `main` (Track 2) — **required-check click is Martin's** (gate).
- ✅ rider (b)'s sentence ships in beta copy (panel + README + known-issues, Track 4).
- ◻ obligations read VERIFIED in **both** ledgers — Alfred side done here; the Holmes `STATE.md` edits (cross-link + status flips) are Holmes-side, Martin's.
- ◻ obligation 3's rollback exercise is PENDING-Martin (the one non-code item, by design).

### Baselines — evolved only as named, never silently shrunk

| Baseline | At Stage-0 | At Stage-1 close | Delta (accounted) |
|---|---|---|---|
| vitest | 321 passed \| 4 skipped | **256 passed \| 2 skipped** | −70 TS policy tests (mapped to Rust), +5 new TS tests (connect-errors, analytical helpers), −2 Windows-live skips (superseded) — full map in `docs/audit/holmes-stage1-track1-mapping.md` |
| cargo | 12 | **61** | +38 guard/direct-chat, +11 analytical (incl. a spawn-execution proof) |
| contrast | 33/33 | **33/33** | new lab-register UI uses existing evidence tokens; no new pairs |
| CI jobs | 4 (verify/rust/supply-chain/quality) | **5** (+ artifact-guard) | Track 2 |
| exclusion L1/L2 | clean | **clean** | dep resolved; L3 advisory 23→17 (compiled denylist + tests, same exempt class) |

### GATES awaiting Martin (execution order)

1. **Make `artifact-guard` a required status check on `main`** (branch-protection click) — the RC-unblock job is green; binding it makes the guarantee permanent.
2. **Holmes `STATE.md` cross-link + obligation flips** (Holmes-side edit): paste the RC-unblock URL above into the RC gate; flip obligations 1/2/4 → VERIFIED, 3 → VERIFIED-channel/PENDING-rollback, and the adoption row → done. This loop deliberately does not touch the Holmes repo.
3. **Run the rollback dry-run** (`docs/beta/rollback-checklist.md`, journey J6 against a local `latest.json`) + the beta.2→beta.3 live update-cycle walk — flips obligation 3 to fully VERIFIED and clears the beta.4 publish gate.
4. **Publish `v0.1.0-beta.4` ↔ `0.1.3`** — GATED on #3 VERIFIED + Martin's word. The version bump is committed here as its own unpublished commit; publishing is not part of this loop.
5. **Pin bump (optional, separate decision):** re-pin Holmes to its RC tag when cut (its own commit); and/or bump Alfred's staged goose 1.41.0 → the Holmes-verified 1.43.0 (requires a Windows re-stage + live-goose re-verify).
6. **Windows artifact-probe follow-up (ledgered, flag 3):** wire `scripts/artifact-guard-probe.mjs` into `release.yml` against the Windows `.exe` (msedgedriver + sidecar placement) — the probe is already platform-aware.

### Honest limits (verbatim, for release notes and anywhere the guard is described)

The guard governs Alfred's own sessions — a user's separately installed stock goose is theirs;
AGPL forks can strip anything — governance, not the binary, answers for forks; nothing in this
loop claims otherwise anywhere.
