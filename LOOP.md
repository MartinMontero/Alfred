# LOOP.md — Alfred Master Build Loop to Open-Beta MVP (working file; NOT committed unless told)

## SCOPE
Take Alfred from mid-Phase-5 to an open-beta MVP a stranger can install and a non-coder can onboard:
Phase 5 complete + audited, skills channel locked or proven closed, real CI gate, signed (or
risk-accepted) beta installer with working updater, zero-backend PWA live on a
wecanjustbuildthings.dev subdomain with its reduced security model stated honestly, beta docs +
feedback channel.

**OUT (non-goals):** Phases 6–7 (AT Protocol pack; platform integration + i18n). Zapstore. Skillsmith
auto-install wiring. Any lock code before the skills ADR is Accepted. Cert/key purchases executed by
the agent. Widening any security boundary for integration convenience. Copying Onyx-only features.
Scope expansion to chase quality (log as findings instead).

## SESSION ENVIRONMENT (premise correction, applies to every evidence line)
This session runs in the **Linux remote container** (`/home/user/Alfred`), not
`C:/Users/User/dev/Alfred`. Consequences, stated once and carried throughout:
- The staged goose sidecar does not exist here (`src-tauri/binaries/` absent) → sidecar `--version`
  and the live-goose trio are **not executable here**; they route to Martin's Windows machine (or a
  future runner) as verification instruments.
- `cargo test` (test:rust) **fails to build here**: system lib `gdk-3.0` missing (EXECUTED
  2026-07-12; error captured below). Rust telemetry canary is therefore REPORTED-only in this
  session until either (a) Martin approves installing GTK/WebKit dev packages in the container
  (Rule-9 go-ahead item), or (b) it re-runs on Windows.
- Windows installer build/install/journey walks (Stage E/G) are Martin's-machine work by definition.
- The platform repo is cloned as sibling `../wecanjustbuildthings.dev` (HEAD 563220a) — exclusion
  engine runs here. Cloudflare: `CLOUDFLARE_API_TOKEN` (verified active 2026-07-12) + account id in
  env; MCP connector lists 3 workers, none named alfred-pwa. wrangler NOT installed (install =
  announce).

## STAGE POINTER
**Current: BETA SHIP ORDERS — W0–W3 ✓ (PRs #4 + #5 MERGED by builder; copy reframe landed
7b9b386) · W4 ✓ CONFIRMED ON MAIN: run 29553158098 on fec5bc6 (PR #5 merge tip) completed
SUCCESS, all four jobs, chromedriver cause-fix in tree
(https://github.com/MartinMontero/Alfred/actions/runs/29553158098) · W5 UPDATER WIRING STAGED
on the branch (this commit) — see below; keypair ceremony is the gate · then W6 tag → W7 PWA →
W8 docs/SHIP. W6 manual gate on the installed artifact stays in force.**

## W5 UPDATER WIRING (2026-07-17) — full re-scope executed, ceremony-blocked slots explicit
Advisor finding independently re-verified at all six points before wiring (plugin entirely
absent). Landed: `tauri-plugin-updater` 2.9.0 (Cargo) + `@tauri-apps/plugin-updater` ^2.10.1
(npm; vendor-exclusion enforcement PASSED over both lockfiles); desktop-gated registration in
lib.rs; `updater:default` capability; `plugins.updater` in tauri.conf.json (endpoints → GitHub
releases latest.json; **pubkey EMPTY by design until the builder's keypair ceremony**);
`bundle.createUpdaterArtifacts: true`; release.yml `includeUpdaterJson: true` + `.sig` upload
globs; Settings→About "Updates" flow (three explicit user actions — check / download+install /
installer handoff — nothing automatic; plain-language error mapping incl. the honest
"not configured in this build" state; unit-tested, 5 new tests). Bonus residue kill: the About
logo was a hardcoded inline Onyx-rock SVG — replaced with the Alfred mark. Gates: tsc ✓,
vitest 278|4 ✓, exclusion ✓, build ✓. **Dry-run acceptance stands: .sig files + latest.json
actually emitted — requires TAURI_SIGNING_PRIVATE_KEY, i.e. ceremony first.**

## COMMAND DECISION (2026-07-14, builder's words) — ship-first
"Badge protocol SUSPENDED; the three readings are not coming. RULING: B. Fix wave = #1 + #3 as
drafted; #2 documented in beta known-issues. Rationale for the ledger: beta testers should focus
on visible bugs and task-level QA; the shipped beta must be stable and clean in the core note
loop." Hold lifted on the two working-tree docs (loss-class rationale: uncommitted work in an
ephemeral container, logged twice already — A7/A8 being the standing example). #1 remains
ship-blocking with the failure-surface requirement. #3 acceptance = red-first regression tests:
(a) fence survives editor round-trip; (b) "Complete load-bearing fields" idempotent — two
presses, one scaffold; (c) clean badge fixture parses end-to-end.

## W1 TAILS — Windows leg EXECUTED 2026-07-14 (builder's capture, laptop at ≥361b05c after --ff-only pull)
- **Cargo (criterion 1) CLOSED:** standalone 9/9 incl. `closing_job_handle_kills_member_process`;
  re-executed identically inside verify:all. The 224e624-era honest-partial (re-run at/after
  ebb843c) is closed.
- **verify:all (criterion 2) CLOSED:** &&-chain completed through build:web ⇒ every step exit 0.
  Tests **269 passed (269), ZERO skips** — container arithmetic holds (265 + 4 platform-skips,
  every skip executes on Windows). Trio EXECUTED at sidecar-spawn durations: recipes.live 2 tests
  1094ms · acp-handshake 920ms · permission-startup 878ms (real title rendered).
- **Run provenance [VERIFIED] (caveat resolved by builder addendum, 2026-07-14):** post-hoc disk
  check confirms laptop HEAD = **2f72db1 (the branch tip)** at verify:all time — the block's pull
  was the only HEAD-moving event, nothing pulled since. (Original honest boundary: the post-pull
  SHA/exit lines scrolled off before capture; kept here for the record of how it was closed.)
- **Exclusion:** L1/L2 MUST-STAY-BLOCKED failures: 0. L3 advisory red ~20 findings, ALL in the
  enforcement family (provider-lockdown.ts + tests, config-scan.test.ts, dist bundles carrying
  the same strings) — zero findings outside blocklist code = the denylist holding, not leaking.
  Adjudicated known-negative.
- **Journey findings:** #1 P1 vault-create silent failure · #3 P2 non-idempotent scaffold prepend
  above the frontmatter fence (stacking mechanism CONFIRMED in source: parseFrontmatter requires
  fence at line 0, frontmatter.ts:53-56; applyChanges prepends a second block on null parse,
  PropertiesPanel.tsx:157-163 — also the #2 contamination path) · #2 badge CONDITIONAL pending
  the clean-test word · flash-then-revert write-race stays [HYPOTHESIS] — instrument designed
  (three-writer trace), no fix before its verdict. Full plan: docs/proposals/.
- **A7/A8 status entry:** both Stage-A working-tree edits (CLAUDE.md/AGENTS.md reconciliation;
  README.md:36 goose-docs link) are ABSENT from every current tree — container clean at 2f72db1,
  laptop synced to the same history. The uncommitted edits died with their session container.
  RE-STAGE REQUIRED before the W3 commit word; content spec survives in the A7/A8 evidence lines
  of this file (Stage A section).
W1 evidence: docs/audit/study-instrument-landing.md. Gate (a) RATIFIED (ADR-0005 Accepted
2026-07-14, draft date disclosed); gate (b) LOOP-DESIGN.md committed. Commits 271cbbc / 90cc7da /
008a14b; vitest 254|4 → 265|4 (+1 file/+11 tests exactly, skips unchanged); contrast all-AA; both
builds green. W2 payloads transit-verified: map 5da35695 ✓, integration prompt 879ed992 ✓,
triad-canon 3d9af2dc ✓ (stage-d refs recorded: 7cf828c6, ebae855b).
Stages A ✓, B ✓ (Windows-verified), C ✓, D ✓ (CI live + green; Gate D verdict executed: allowlist
= exactly 3 IDs, ruling A reqwest bump landed, run 29311241457 all 4 jobs green). PR #3 merged
2026-07-14: main tip `70952f4` contains everything through `ebb843c`. Sequencing now follows
`cc-prompt-alfred-beta-ship-orders.md` (W0–W8; received 2026-07-14, batch 1 of 3). Next after the
W0 GATE: W1 (study-instrument pass) → W2 (epistemic canon) → W3 (rulings) → W4–W8 per orders.

## STAGE D EVIDENCE (2026-07-13)
- **.github/workflows/ci.yml** — NEW. push + PR, Linux, Node 22. Jobs: `verify` (typecheck app+mcp,
  vitest, vendor-exclusion L1+L2 blocking + L3 advisory via a cloned sibling platform repo,
  zero-Soapbox DEPENDENCY-manifest gate [not a source grep — constitution text names Soapbox
  legitimately], build + build:web), `rust` (apt webkit deps + cargo test [byte-scan canary] +
  cargo-audit), `supply-chain` (OSV-Scanner, gitleaks, Syft SBOM + Grype fail-on-high/critical),
  `quality` (axe-core 0 serious/critical, Lighthouse a11y≥95/perf≥90/LCP≤2.5s/CLS≤0.1, lychee).
  **D2 honest skip surfacing:** a job-summary note that the live-goose trio is NOT exercised on
  Linux CI; Windows verify:all is the source of truth.
- **.github/workflows/release.yml** — REWRITTEN. Windows-only (Mac/Linux/Android deferred per SCOPE
  OUT), Node 22, all actions SHA-pinned. Downloads pinned goose 1.41.0 + stages it (--require
  hard-fail), runs `npm run test` (the live-goose trio EXECUTES here — Windows runner), builds via
  tauri-action (unsigned when signing secrets absent), draft release. **This closes part of D4:**
  goose behavior is now exercised in the release lane, not just Linux-skipped.
- **renovate.json** (D5) — pinDigests for github-actions (keeps SHA pins, bumps them), grouped dev
  toolchains, security labels.
- **.grype.yaml** — empty documented allowlist (no silent silencing). **lighthouserc.json** — the
  four thresholds against staticDistDir dist-web.
- **ALL 14 actions SHA-pinned** (real SHAs fetched via git ls-remote from each public repo;
  verified: no floating tags). No Trivy (CVE-2026-33634). Node 22 (was 20).
EXECUTED here: YAML/JSON parse valid; SHA-pin audit clean; no-Trivy-usage; Node-22 confirmed.
CANNOT execute here (GATE-D validation is a real run): the actual CI on GitHub's runners.
**GATE D decisions owed:** commit plan; then the go-ahead items are (a) PUSH the workflows (a real
CI run is the validation), and (b) the D6 CI-fail canary — push a branch with a deliberately failing
check to prove the gate blocks, then delete. First real run WILL surface any third-party action
input-name mismatches (OSV/anchore/axe/lighthouse) + a11y/perf threshold calibration — expected,
that's what the live run is for.

## PRIOR: STAGE C POINTER (kept for history)

## STAGE C EVIDENCE (2026-07-13, ADR-0003 Accepted → Implemented)
Built as pure, tested security primitives (Skillsmith auto-install stays OUT per ADR-0003; the
locks are the gate any future install must pass — no live install path wired yet, by design).
- **Lock 1** `src/lib/skills/skill-scan.ts` — SKILL.md scan reusing the invisible-char sanitizer
  (Tags block / zero-width / bidi / supplementary variation selectors) + `scanEncodedPayloads`
  decode-before-match (base64/hex, flagged only when decoded content carries hidden chars — no FP
  on legit assets) + frontmatter-identity requirement.
- **Lock 2** `buildSkillConsent` + `src/components/SkillConsent.tsx` — install consent via the
  shared ActionPreview ack gate (declared surface, trust tier, sanitized body excerpt, per-warning
  acknowledgement; never silent).
- **Lock 3** `src/lib/skills/skill-registry.ts` — SHA-256 content pin, `diffSkillSets`,
  `rescanActiveSkills` session-start re-scan (rug-pull defense: flags out-of-band edits / now-warns
  / missing).
EXECUTED: typecheck + typecheck:mcp PASS; full vitest **254 passed | 4 skipped** (+18 skill tests);
exclusion L1+L2 clean; build PASS (SkillConsent compiles into bundle). C4 planted-failure canaries
FIRED (neutered Tags-detection → Tags canary failed; neutered hash-compare → rug-pull canary
failed) then restored byte-clean.
Docs: docs/threat-model.md Surface 4 updated; ADR-0003 marked Implemented.
**GATE C decisions owed:** commit plan approval (per-unit); nothing committed yet.

## STAGE D EVIDENCE (2026-07-13) — CI gate authored + driven on live GitHub Actions
Files: `.github/workflows/ci.yml` (verify / rust / supply-chain / quality; Node 22; all actions
SHA-pinned; no Trivy), rewritten `release.yml` (Windows, staged goose 1.41, live trio in the
release lane), `renovate.json` (digest-pinned actions), `.grype.yaml`, `lighthouserc.json`.
Committed + pushed (Martin authorized commit+push+iterate-to-green for Stage D).
**Live-run results (iterated over 7 rounds, each fixing a distinct real CI issue, not a defect in
Alfred):**
- **D6 canary PROVEN:** round-1 canary branch `claude/ci-fail-canary` — its `verify` job went RED
  on a deliberately-failing test. The gate blocks bad code. (Branch undeletable via the git proxy;
  Martin to remove via GitHub UI.)
- **verify GREEN:** typecheck app+mcp, Vitest, exclusion L1+L2+L3 (clones the sibling platform repo
  in-workflow), zero-Soapbox dep gate, both builds.
- **supply-chain GREEN:** OSV (subpath action, report-only), gitleaks, Syft SBOM, Grype (blocking
  high/critical).
- **quality:** axe-core + Lighthouse GREEN; lychee fixed (was scanning node_modules, then bot-blocked
  research citations → scoped to operational docs, `docs/research/` excluded, accept 429).
- **rust:** `cargo test` + born-redacted byte-scan canary GREEN on Linux (placeholder sidecar for the
  build-script check). `cargo audit` reworked to fail only on real vulnerabilities (informational
  unmaintained/unsound reported, non-blocking = constitution's block-high/critical).
**BLOCKED — GATE D decision owed (real security finding, stop-and-ask):** cargo-audit caught 9
transitive vulnerabilities. `cargo update` fixed 2 in-constraint (bytes→1.12.1 RUSTSEC-2026-0007;
time→0.3.53 RUSTSEC-2026-0009). **5 remain, needing a Tauri/reqwest bump (outside current
constraints):** quick-xml RUSTSEC-2026-0194 + 0195 (parser DoS; Alfred parses no untrusted XML),
rustls-webpki RUSTSEC-2026-0098 + 0099 (name-constraint validation) + 0104 (CRL-parse panic) — all
transitive, mostly moderate, on the old rustls-webpki 0.101.7 in the tree. Options for Martin:
(A) bump Tauri/reqwest to pull patched versions (real scope, needs Windows compile-verify);
(B) time-boxed DOCUMENTED allowlist of these 5 with severity justification, tracked for the Stage-E
Tauri bump (a documented-allowlist per constitution, but suppressing an advisory = stop-and-ask →
his word required). NOT allowlisted autonomously.

## GATE D VERDICT (2026-07-14, builder's words) + EXECUTION
Verdict: "Option B (documented allowlist) for quick-xml ×2 and uuid — with per-finding proof and
triggers. Take the safe fix for @babel/core. Confirm-then-close rustls-webpki (likely already
patched at 224e624). Log-and-move the 23 unmaintained/unsound warnings. No Tauri bump."
Executed (working tree, uncommitted, at 224e624):
- **Allowlist LANDED:** `docs/security/dependency-allowlist.md` — per-finding proof + triggers +
  review date 2026-10-14 for quick-xml RUSTSEC-2026-0194/0195 ×2 copies (0.37.5 = winrt toast
  WRITER in the Windows artifact, parse-side flaws unreachable; 0.38.4 = Linux-Wayland subtree,
  not compiled into the shipped .exe) and npm uuid GHSA-w5hq-g745-h8pq via exceljs (v4-only,
  zero-arg, write-path-only; Alfred is read-only viewer). ci.yml cargo-audit now carries the two
  --ignore flags; verified locally: vuln count 7→3. `.grype.yaml` stays empty (no GHSA aliases
  for quick-xml; uuid is moderate < high cutoff).
- **@babel/core FIXED:** npm audit fix → 7.29.7 (GHSA-4x5r-pxfx-6jf8 cleared); lockfile-only;
  tsc + Vitest 254/254 (4 honest Linux skips) green after.
- **CORRECTION — rustls-webpki confirm-then-close FAILED confirmation:** fresh cargo-audit
  (DB 2026-07-14) still flags 0098/0099/0104 at 0.101.7; patched ranges start 0.103.12/13.
  Also corrected: the fix path is NOT a Tauri bump — reqwest 0.11 is Alfred's own direct dep
  (lib.rs custom-provider TLS commands). Real fix = reqwest 0.11.27→0.12.28 (rustls 0.23 +
  webpki 0.103.13; also clears the rustls-pemfile unmaintained warning). NOT ignored in CI —
  rust job deliberately red pending the builder's word. STOP-AND-ASK reissued → RESOLVED below.
- **FINAL RULING (2026-07-14, builder's words):** Decision 1 = **A** — "Bump reqwest 0.11.27 →
  0.12.28 (your locally verified line wins over the 0.13 in the planning docs — the proof
  standard decides, not the version number)." Decision 2 = commit and push after three
  corrections: (1) no webpki ignore anywhere — ruling A means FIXED, never ignored (an ignore on
  a fixed item masks regressions); (2) the allowlist is exactly three IDs — RUSTSEC-2026-0194,
  RUSTSEC-2026-0195, GHSA-w5hq-g745-h8pq — each with reason + pointer to this decision record;
  (3) the Gate-D records state ruling A, not B. Then the bump as its own commit; proof standard:
  before/after `cargo tree -i rustls-webpki` (after = ONLY ≥0.103.13), `cargo tree -i rustls`
  (no 0.21.x), cargo test 9/9, cargo-audit 0 vulns, npm test at machine baseline; never
  `npm audit fix --force`.
- **23 informational warnings logged** (18 unmaintained incl. Linux-GTK family; 5 unsound) in the
  allowlist doc; non-blocking per constitution; monthly-cadence review.

## W0 RECONCILIATION (2026-07-14) — ship-orders W0 step 1+3 EXECUTED, step 2 pending inputs
Orders: `cc-prompt-alfred-beta-ship-orders.md` (batch 1 of 3 received; operator card alongside).
**Topology (EXECUTED):** origin/main `70952f4` = PR #3 merge; PRs #1 `6829c88` / #2 `150e25c` /
#3 `70952f4` all merged from this working branch; branch tip `ebb843c` fully contained in main;
local working branch re-pointed to main tip, clean tree.
**Stage-D end-state verification (EXECUTED, at main tip):** ci.yml cargo-audit ignores = exactly
RUSTSEC-2026-0194 + 0195 (no webpki ID ignored anywhere; webpki IDs appear in the allowlist doc
only inside the RESOLVED-ruling-A table); allowlist doc = exactly the three authorized IDs with
proof/triggers/review-date/decision-record per entry; LOOP.md carries the FINAL RULING block;
docs/audit/safety-spine-verification.md committed (f60ea44) and in main; Cargo.toml reqwest =
0.12.28; Cargo.lock: rustls-webpki 0.103.13 + rustls 0.23.42 only; cargo-audit 0 vulns /
22 warnings (EXECUTED 2026-07-14); CI run 29311241457 on ebb843c: all four jobs SUCCESS.
**cargo 9/9 nuance (honest):** Linux CI executes 8 of 9 (job_guard is #[cfg(windows)]); the
9/9 incl. Job Object ran on Windows at 224e624; re-run at/after ebb843c awaits laptop pull
(4 commits behind).
**W0 step 2 — BLOCKED on inputs:** `docs/audit/stage-d-vulnerability-decision.md` is NOT in the
repo (decision content lives in docs/security/dependency-allowlist.md + this ledger). The two
reference artifacts (`docs-audit-stage-d-vulnerability-decision.md`,
`alfred-stage-d-allowlist-entries.md`) are in manifest batch 3 — requested; reconcile-or-create
when they arrive.
**W0 GATE (operator card):** audit-note commit word — already satisfied (f60ea44, pushed, merged).
Branch ruling merge 63gf68→main — already satisfied by PR #3. Remaining word: confirm beta tags
cut from main + proceed to W1 (W1 needs `cc-prompt-alfred-study-instrument-land.md` +
`study-instrument-pass.patch` — batch 2).

## PRIOR: STAGE B POINTER (kept for history)
Stage order: A ✓ (committed b5c1a98..d1d96e3, pushed 2026-07-12) → B (now) → C three locks
(ADR-0003 Accepted — authorized after B) → D CI gate → E release → F PWA deploy → G launch gate.

## GATE A OUTCOME (2026-07-12, builder's words verbatim)
1. permission gate: "fix as recommended" → option (a). 2. skills: "build the locks" → ADR-0003
Accepted. 3. Direct Chat: "keep (relabeled)" → ADR-0004 Accepted, Option A. 4. "Commit stage A"
5. "push" — five doc commits b5c1a98, a1e6ee4, 0a49292, 840617c, d1d96e3 pushed to
origin/claude/alfred-project-status-63gf68. LOOP.md deliberately uncommitted.

## STAGE B PROGRESS
**Cycle 1 (2026-07-12) — DONE, all gates green, uncommitted (commit plan at Gate B):**
- Permission-gate fix (builder decision 1): GoosePanel auto-allow branch REMOVED (every
  requestPermission → human ack; DENY default unchanged); `classifyToolCall`/`GateDecision` →
  `describeToolCallHint`/`ToolCallHint` (display-only); comments reconciled.
  EXECUTED: typecheck PASS; vitest 205 passed | 4 skipped (19 files, 3 live files skip); pin test
  "enforcement is never title-keyed" incl. src/-wide source scan; planted canary (__canary.ts)
  FIRED then removed, clean re-run 8/8. Exclusion L1 "6 manifests clean" L2 "2 lockfiles clean".
  DoD line "never model-authored title" → satisfied pending Gate-B verify:all re-run.
- B6 (partial): provider-policy.ts docstring fixed (Llama-on-permitted-infra allowed — matches
  code + false-positive suite); Settings.tsx dead derekross/onyx-skills link removed.
  B6 remainder: engines field (node >=22.12) = Gate-B approval item per task.
- phase5.md Step-2 section updated (defect → fixed with proof).
**Cycle 2 (2026-07-12) — DONE, gates green, uncommitted:**
- B5 startup scan: `scanGooseConfigText` in provider-lockdown.ts (URL + bare-host candidates
  screened through the SHARED checkProviderEndpoint denylist — cannot diverge from policy);
  wired in distribution.ts: scans any pre-existing (hand-edited) config before regeneration AND
  the generated yaml as a writer-regression tripwire; `GooseDistribution.warnings` surfaced in a
  GoosePanel warning banner (warn, never silently rewrite — but note the regenerate-each-session
  behavior means excluded hand-edits are also not carried over, stated in the warning text).
  EXECUTED: typecheck PASS; new `config-scan.test.ts` (4 tests: openai base_url line 4, bare
  api.x.ai/llama-api.com with vendors, clean-config negative incl. llama-on-Ollama, excerpt
  bound); full vitest 209 passed | 4 skipped; exclusion L1+L2 clean.
**Cycle 3 (2026-07-13) — DONE, gates green, uncommitted:**
- B4 telemetry Settings UI: new desktop-only "Privacy & Telemetry" section in Settings.tsx —
  plain-language consent copy ("anonymous usage counts and timings … never your notes, prompts,
  or keys … off until you turn it on"); opt-in toggle → save_settings; Export (JSON download);
  Erase (confirm-gated) → telemetry_wipe with row-count result; metrics view (by_kind counts +
  avg ms). Wired to the existing registered commands (load/save_settings, telemetry_metrics/
  wipe/export — lib.rs:1305-1308). Desktop-gated via isDesktop() in both the nav filter and the
  onMount loader (web build has no telemetry writer).
  **Correctness fix caught in review:** save_settings overwrites the whole file; the toggle now
  ABORTS if load_settings throws instead of writing a partial object that would null vault_path.
  EXECUTED: typecheck PASS; build:web PASS (section compiled-gated out of web — negative proof of
  the desktop gate); vitest 209 passed | 4 skipped; exclusion L1+L2 clean.
  **Windows-verification item for Gate B (routed, not claimed):** the live opt-in→record→metrics→
  wipe→off-means-off journey (J5) runs on Windows; command behavior itself is already proven by
  telemetry_tests.rs (byte-scan canary, opt-in-inert, wipe-removes-rows) — REPORTED here (cargo
  fails on missing gdk-3.0). UI wiring proven by typecheck + web build only.
**Cycle 4 (2026-07-13) — DONE, gates green, uncommitted:**
- B2 context-probe harness: `src/lib/agentic/context-probes.ts` (recall/artifact/continuation
  over the assembled hot.md substrate; deterministic, zero-spend; path-form matching for
  artifacts; reports missing expectations). Source: atproto-case-study.md:12. Retires the
  vacuously-green CLAUDE.md "three context probes" gate item.
  EXECUTED: `context-probes.test.ts` 7 tests incl. 3 must-fail cases; planted-failure canary
  FIRED (1 failed) then reverted clean (7/7); no residue (grep 0).
**Cycle 5 (2026-07-13) — DONE, gates green, uncommitted:**
- B3 memory-poisoning gate: `src/lib/agentic/memory-review.ts` (reviewMemory/gatePromotions —
  agent-authored → needs-review; obfuscation/policy-tamper → reject; reuses invisible-chars
  sanitizer). ENFORCED at the chokepoint: mcp/server.ts memory_bank_update refuses rejected writes
  before touching the vault. EXECUTED: app+mcp typecheck; memory-review.test.ts (7) +
  mcp/server.test.ts poisoning cases (2); planted canary (disable reject) FIRED both, restored
  byte-clean (grep 0); full vitest 225 passed | 4 skipped.
**Cycle 6 (2026-07-13) — DONE, gates green, uncommitted:**
- B1 latency-accuracy guardrail (Option B): `src/lib/telemetry/guardrail.ts` (deterministic
  born-redacted signal from durationMs + grounding boolean; grounding = ToolKind 'read' ran,
  never a title — stricter redaction than the title-allowlist, noted in phase5.md). Wired live
  through session-tap.ts (onGuardrail observer, per-turn reset, NOT persisted) and consumed in
  GoosePanel (slow-ungrounded spot-check nudge; only when telemetry opted in). EXECUTED: typecheck;
  build; guardrail.test.ts (8, zero-spend smoke) + session-tap.test.ts guardrail cases (3, incl.
  content-free readout assertion); full vitest 236 passed | 4 skipped; exclusion L1+L2 clean.
- BLOCKED (routed): B1 live activation = 1 paid goose turn on Windows; a *persisted* guardrail
  metric = Rust schema add (Windows cargo). B6 engines field = Gate-B approval item.
**STAGE B remaining before GATE B is closeable:** (1) Martin's go on `engines` field; (2) goose
1.39→1.41 bump decision; (3) Windows execution of the live-goose trio + cargo telemetry canary +
the B1 paid turn; (4) commit plan approval. Items (3) are Martin/Windows; the code is complete.

## WINDOWS VERIFICATION — EXECUTED 2026-07-13 (Martin's laptop, resolved items 1-3 above)
Decisions applied: engines field added (node >=22.12); goose bumped to 1.41.0 (installed + staged).
- goose 1.41.0 installed (download_cli.ps1, pinned GOOSE_VERSION=1.41.0) → `goose --version` = 1.41.0.
- `npm ci` → 790 packages, both patches applied (exceljs swap = no CDN fetch failure). 3 npm-audit
  advisories (1 low/2 moderate) — logged, NOT auto-fixed (Stage-D supply-chain scope).
- `npm run stage:goose` → "goose 1.41.0 matches the target", sidecar up to date.
- `npm run test` → **240 passed | 0 skipped** — the live-goose trio (permission-startup,
  acp-handshake, recipes.live ×2) EXECUTED and passed against 1.41.0. (Cloud was 236 | 4-skipped.)
- `npm run test:rust` → **9 passed | 0 failed** incl. born-redacted byte-scan canary + Windows
  job-guard. One dead-code warning (query_by_trace) — fixed with #[allow(dead_code)].
- Stale "goose 1.39.0" test title + "248 MB" comment corrected in permission-startup.test.ts.
- NOT run on Windows: literal full verify:all (typecheck/exclusion/builds) — platform-independent,
  green in cloud; exclusion needs the sibling repo not present on the laptop.
**DoD line "verify:all green locally WITH the live-goose trio EXECUTED" — SATISFIED** (the
Windows-specific portion; the platform-independent remainder is green in cloud).
**In progress:** B1 paid guardrail activation turn (npm run tauri dev) — Martin running it; cosmetic
confirmation of the slow-ungrounded nudge + metrics capture.
**Cleanups this turn (uncommitted, commit plan below):** stale title/comment fix, query_by_trace
#[allow(dead_code)], phase5.md + LOOP.md evidence recording.
probes (recall/artifact/continuation; plant-one-wrong-expectation discipline); B3 memory-poisoning
review gate + privacy/consent; B1 guardrail Option B (zero-spend smoke first; the one paid
activation turn = BLOCKED-announce for Martin).
**Blocked/routed:** live-goose trio + cargo telemetry canary → Windows (or "install gtk libs"
go-ahead for cargo here). Rust tests fail here on missing gdk-3.0 (STEP-0 §6).

## ADR NUMBERING NOTE (drift from the task prompt)
`docs/decisions/0002-xlsx-registry-replacement.md` landed 2026-07-12 (commit 04ea7dc, authorized +
pushed) before this loop started. The task's "ADR-0002 (skills)" is therefore **ADR-0003** and its
"ADR-0003 (in-app AI)" is **ADR-0004** in the tree. All references below use tree numbering.

## STEP-0 READOUT (2026-07-12; every premise: held / false / drifted, with evidence class)
1. **goose version** — sidecar `--version`: NOT EXECUTABLE HERE (no binaries/ in container);
   staged = 1.39.0 REPORTED 2026-06-28 (docs/goose.md, phase4 audit). Live releases
   github.com/aaif-goose/goose: **v1.41.0 (2026-07-03) latest**, v1.40.0 (07-02), v1.39.0 (06-25) —
   VERIFIED-LIVE 2026-07-12. Premise HELD. Bump = Gate-B decision item.
2. **Pins** — EXECUTED (package.json read): @agentclientprotocol/sdk ^1.0.0 ✓, @modelcontextprotocol/sdk
   ^1.29.0 ✓, nostr-tools ^2.19.4 ✓, @tauri-apps/api ^2.9.1 / cli ^2.9.6 (npm latest 2.11.1/2.11.4
   VERIFIED-LIVE — in-semver drift, no action). **No engines field** ✓ HELD. CLAUDE.md drift
   confirmed → fixed in A7.
3. **Tree** — EXECUTED: clean; branch claude/alfred-project-status-63gf68, 1 commit ahead of
   origin/main: 04ea7dc (exceljs swap; authorized by Martin 2026-07-12, pushed). phase5.md ABSENT
   (A1 proceeds). repo-manifest.txt ABSENT. debug-nip46.mjs EXISTS (G2 candidate). README
   correction NOT in tree — README.md:36 still links block.github.io/goose → staged fresh in A8.
4. **Permission gating identity** — EXECUTED (tool-gate.ts, GoosePanel.tsx:138-149,
   acp-client.ts:184-193 read): goose-side permission.yaml keys on namespaced
   `(extension__tool_name)` ids ✓. **Alfred-side `classifyToolCall` auto-allow keys on ACP
   `title`+`kind` — agent-authored display metadata — and ANSWERS requestPermission with it
   (GoosePanel.tsx:141 → selectAllowOption). That is title-keyed ENFORCEMENT = the spoofable bug.**
   Recorded in docs/threat-model.md §ACP. Per protocol: no further gating work (Stage B/C) until
   Martin decides the fix direction (options in threat-model + Gate-A readout). Default-deny path
   itself is sound (no handler → cancelled).
5. **Skillsmith live** — VERIFIED-LIVE (npm, 2026-07-12): @skillsmith/core **0.11.1**,
   @skillsmith/mcp-server **0.7.2** — BOTH prior REPORTED values (0.9.0 / 0.4.10+0.4.3) stale;
   npm is authority. License Elastic-2.0 ✓ HELD. SECURITY.md (github main, VERIFIED-LIVE): mentions
   zero-width obfuscation only; **no Tag Block U+E0000–U+E007F, no variation selectors, no bidi** —
   gap HELD; lock-1 urgency intact. → ADR-0003.
6. **verify:all** — component-wise EXECUTED 2026-07-12 in this container:
   - typecheck ✓ PASS; typecheck:mcp ✓ PASS; vitest ✓ 210 passed | 4 skipped (19 files passed,
     3 skipped); build (vite) ✓; build:web ✓ (27 precache entries); check:exclusion L1 ✓ "6 manifests
     clean" L2 ✓ "2 lockfiles clean"; L3 advisory: 18 expected hits, all in denylist code/tests.
   - **test:rust ✗ FAILS HERE**: `The system library gdk-3.0 required by crate gdk-sys was not
     found` — container lacks GTK/WebKit dev libs. Rust telemetry canary NOT re-executed this
     session (REPORTED green, phase audits ≤2026-06-28).
   - **SKIP REPORT (by design):** permission-startup.test.ts (requires win32 + staged sidecar);
     acp-handshake.test.ts, recipes.live.test.ts (skipIf no GOOSE_BIN). Live-goose trio NOT
     EXECUTED here; any goose-behavior claim in this loop is REPORTED until they run on Windows.
7. **CI state** — EXECUTED read: .github/workflows/ = release.yml only; inherited from onyx;
   tag-triggered; tag-pinned actions (checkout@v4 etc.); Node 20; zero tests; never stages sidecar.
   Premise HELD. No edits yet (Stage D).
8. **PWA/deploy** — build:web ✓ EXECUTED today. No wrangler.jsonc/toml anywhere ✓. CLAUDE.md
   DECISIONS mandate (governs Stage F, quoted): *"Cloudflare Workers static assets, deployed as its
   own Worker (distinct name in Alfred's wrangler.jsonc, e.g. alfred-pwa; inherit the account from
   the environment — no hard-coded account_id) so it never overwrites the platform on the shared
   account."* Desktop-only surfaces on web: platform/web/ai.ts = loud-reject stub (EXECUTED read);
   GoosePanel + CustomProviderChat gated `!isMobileApp() && !isWeb()` (App.tsx:2704,2726,3009,3050
   EXECUTED grep); telemetry tap armed only inside GoosePanel; MCP server = separate process, not
   in web bundle. **No in-product delta notice exists yet** (F3 work).
9. **In-app AI subsystem** — EXECUTED reads (CustomProviderChat.tsx header+usage, tauri/ai.ts,
   web/ai.ts, ai-credentials.ts): CLASSIFICATION = Onyx in-app-chat remnant, generalized to "any
   OpenAI-compatible endpoint" (MapleAI proxy, Ollama, LM Studio, vLLM), REACHABLE in product
   (App.tsx:3033; Settings 'customprovider' section; desktop-only), Phase-1-hardened: every request
   passes assertProviderAllowed (denylist chokepoint, tauri/ai.ts:23-32); key in OS secret store
   with documented plaintext-localStorage fallback when store locked (threat-model item). → ADR-0004
   with recommendation.
10. **Load-bearing files** — EXECUTED reads: src/lib/security.ts (XSS/path/url sanitizer library
    used by chat markdown + viewers); src-tauri/src/job_guard.rs (Windows Job Object
    kill-on-close, read in full, matches docs); src-tauri/capabilities/default.json (sidecar spawn
    allowlisted to binaries/goose with acp/recipe args only; fs scope $DOCUMENT/$DOWNLOAD/
    $APPCONFIG/$APPDATA/$HOME/.config/alfred).
11. **Environment** — node v22.22.2 (≥22.12 ✓), rustc/cargo 1.94.1 ✓, wrangler ABSENT (recorded;
    install = announce). Linux container (see SESSION ENVIRONMENT).
12. **Dated obligations** — first monthly upstream (derekross/onyx) security review due
    **~2026-07-25** (Stage E8; back-port log empty). **MCP 2026-07-28 spec release** → re-verify
    pass on SEP-414 keys + server behavior after that date (post-Stage-D item; verification-pass
    doc mandates it).

## BETA DEFINITION OF DONE (verbatim; every line needs evidence)
- [x] Phase 5 steps 5/6/7 shipped + docs/audit/phase5.md exists and matches the tree.
      (EXECUTED: Stage B evidence above; phase5.md in main at 70952f4.)
- [x] Skills channel: three locks shipped (post-ADR) OR channel proven closed on the real launch
      path with a pinning test + recorded accepted-risk. No Skillsmith auto-install without locks.
      (EXECUTED: Stage C, ADR-0003 Implemented 2026-07-13, planted-payload canaries green;
      Skillsmith auto-install remains OUT.)
- [x] Permission enforcement proven keyed on (extension, tool_name), never model-authored title.
      (EXECUTED: Stage B fix + safety-spine row 4 — exact-match Set.has, 8/8, live goose start
      at 224e624 on Windows 2026-07-14.)
- [ ] verify:all green locally WITH the live-goose trio EXECUTED on this machine; CI green on remote
      with honest skip surfacing; SHA-pinned actions; no Trivy.
      (PARTIAL: CI green at ebb843c incl. rust job on the new TLS stack [run 29311241457]; trio
      EXECUTED on Windows at 224e624; laptop is 4 commits behind — trio re-run at/after ebb843c
      pending laptop pull; full closure comes with the W6 manual release gate.)
- [ ] Threat model, SECURITY.md, privacy policy, LICENSE-COMPLIANCE.md published.
      (PARTIAL: docs/threat-model.md + SECURITY.md exist in main; privacy policy and
      LICENSE-COMPLIANCE.md not yet written — W8 candidates.)
- [ ] Installer: built, installed, journeys EXECUTED on it; updater keypair generated + escrowed;
      signing state = signed, or unsigned with Martin's recorded acceptance + AV-submission plan.
- [ ] Sidecar pinned by version + SHA-256; goose version decision recorded (1.39.0 held or bump
      executed + re-verified).
      (PARTIAL: version pin 1.41.0 + bump re-verified live [trio EXECUTED 2026-07-13/14]. The
      SHA-256 pin does NOT exist yet — stage-goose-sidecar.mjs:27 defers it to Stage E (E4) in
      its own comment. W5 work. Earlier "hash-verified" phrasing in session reports overstated;
      corrected here.)
- [ ] MCP server bundled — no npx tsx dependency in the packaged app.
- [ ] PWA live at the confirmed wecanjustbuildthings.dev subdomain; delta notice visible; live
      journeys EXECUTED post-deploy.
- [ ] Onboarding completable by a non-coder (Ollama path or guided key) — walked, not assumed.
- [ ] Telemetry opt-in/wipe/export reachable in Settings; off by default; byte-scan canary still green.
- [ ] Onyx residue purged; ADR-0004 executed; README current with an Alfred (not Onyx) screenshot.
- [ ] Key backup ceremony documented; vault schema versioned.
- [ ] Feedback channel live; known-issues honest; CHANGELOG + tagged beta release published on
      Martin's word.

## JOURNEYS (end-to-end user paths in scope)
J1 Desktop first-run → onboarding → provider set up (Ollama zero-config or BYO key).
J2 Create/edit/link notes; daily notes; graph/backlinks.
J3 goose session with permission prompts (read auto via goose-side allow; write/shell ask).
J4 Recipe pre-flight: open recipe → ActionPreview → approve/reject → run.
J5 Telemetry opt-in → session → metrics view → wipe; off-means-off re-check.
J6 Update check on installed app (updater dry-run vs local latest.json).
J7 PWA: load → notes CRUD → persistence across reload → delta notice visible.
J8 Beta tester: download → install (SmartScreen path documented) → onboard without hand-editing
   config.
Desktop journeys J1–J6 EXECUTE on Windows (Martin / runner). J7 executes here via wrangler dev at
Stage F. Fresh-eyes pass per stage per protocol.

## GATES (exact commands that must exit 0)
- npm run verify:all  (composite; component evidence + skip report every gate)
- Stage-specific: vitest paths for new tests (B: guardrail/probes/poisoning; C: lock canaries),
  actions SHA-pin audit grep (D), wrangler dev journey walk (F), installed-app walk (E/G — Windows).
- Anti-false-green checklist on every claimed pass (could it pass wrong; real path observed; gate
  actually runs; same value not same shape; off-means-off).

## ASSUMPTIONS (judgment calls; stop only if resolution needs Martin or irreversibility)
- ADR renumbering (0002 taken) handled as above — flagged at Gate A.
- Stage-A work happens on the existing session branch; commit split proposed at Gate A; nothing
  committed in Stage A beyond what Martin already authorized (04ea7dc predates loop).
- "Skillsmith SECURITY.md" read from repo `main` (smith-horn/skillsmith) as the live source.
- CustomProviderChat treated as read/context-inject chat (no vault-write path observed in its
  props/API); to be re-verified in ADR-0004 execution if KEEP.
- The task prompt's "ADR-first gates" + item-4 instruction read as: Stage A completes (docs incl.
  threat model), Stage B/C gating code waits for Martin's fix-direction decision at Gate A.

## DATED ITEMS
- ~2026-07-25: first monthly onyx upstream security review (Stage E8).
- 2026-07-28: MCP spec release → SEP-414/MCP re-verify pass (log outcome here + docs/audit/).

## FINDINGS LOG (logged, not built)
- F-1 provider-policy.ts:13-18 stale docstring (Llama-local contradiction) — B6 quick fix.
- F-2 Settings.tsx:2624 dead derekross/onyx-skills link — B6.
- F-3 ai-credentials.ts localStorage plaintext fallback when secret store locked — threat-model'd;
  consider surfacing a warning in Settings when fallback active (Stage B candidate, not committed).
- F-4 tauri api/cli pinned ^2.9 vs 2.11 current — in-range; revisit at Stage E (updater work pulls
  tauri-plugin-updater in anyway).
- F-5 debug-nip46.mjs at repo root — dev artifact; G2 purge candidate.
- F-6 exceljs date cells render ISO strings (decision 0002 consequence) — cosmetic; viewer polish
  candidate post-beta.
- F-7 Tauri capabilities include broad clipboard (read image/text) — review necessity at threat-model
  refresh (G6).

## STAGE A EVIDENCE (2026-07-12)
- A1 docs/audit/phase5.md — WRITTEN (in-progress audit, not completion; per-step proven-by-test vs
  reported; skipIf trio named; steps 5-7 open).
- A2→ADR-0003 docs/decisions/0003-skill-recipe-format-and-skillsmith.md — WRITTEN (Proposed).
- A3→ADR-0004 docs/decisions/0004-in-app-ai-keep-or-cut.md — WRITTEN (Proposed, with
  recommendation KEEP-reframed).
- A4 docs/threat-model.md — WRITTEN (STRIDE skeleton; title-keying finding; denylist honesty;
  Stage-B startup-scan unit named).
- A5 SECURITY.md — WRITTEN.
- A6 docs/release-process.md — WRITTEN.
- A7 CLAUDE.md + AGENTS.md reconciled (tooling table + constraint #2 → config-level denylist per
  phase4 audit; applesauce row corrected; ACP SDK 1.0; goose row current) — WORKING-TREE EDIT, not
  committed.
- A8 README.md:36 block.github.io/goose → goose-docs.ai — WORKING-TREE EDIT, not committed.
