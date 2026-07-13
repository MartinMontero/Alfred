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
**Current: STAGE B (Phase-5 completion) — CODE COMPLETE (cycles 1-6), awaiting GATE B review.**
Next gate: GATE B (verify:all + skip report; live trio + cargo need Windows; commit plan per-unit;
engines-field + goose-bump decisions).
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
- [ ] Phase 5 steps 5/6/7 shipped + docs/audit/phase5.md exists and matches the tree.
- [ ] Skills channel: three locks shipped (post-ADR) OR channel proven closed on the real launch
      path with a pinning test + recorded accepted-risk. No Skillsmith auto-install without locks.
- [ ] Permission enforcement proven keyed on (extension, tool_name), never model-authored title.
- [ ] verify:all green locally WITH the live-goose trio EXECUTED on this machine; CI green on remote
      with honest skip surfacing; SHA-pinned actions; no Trivy.
- [ ] Threat model, SECURITY.md, privacy policy, LICENSE-COMPLIANCE.md published.
- [ ] Installer: built, installed, journeys EXECUTED on it; updater keypair generated + escrowed;
      signing state = signed, or unsigned with Martin's recorded acceptance + AV-submission plan.
- [ ] Sidecar pinned by version + SHA-256; goose version decision recorded (1.39.0 held or bump
      executed + re-verified).
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
