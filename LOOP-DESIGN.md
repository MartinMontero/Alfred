# LOOP-DESIGN.md — "Study & Instrument" design pass (working file; NOT committed unless told)

## SCOPE
Presentation-layer pass implementing the settled design direction on existing SolidJS surfaces:
Direction-A design tokens (registers, evidence states, type roles, motion, reduced-motion),
evidence-provenance primitives (pure parse module + badge component + tests), ActionPreview
token-class restyle with optional reversibility field. Zero new dependencies; zero logic changes.

**OUT:** gating/permission logic; three-locks/skills code (ADR pending); Skillsmith wiring; rebrand;
Onyx feature copying; chatbot; telemetry changes; component libraries; README rewrite;
global brand-accent repaint (violet stays until Martin signs the palette swap); scope expansion.

## SESSION ENVIRONMENT (premise, applies to every evidence line)
claude.ai container, `/home/claude/alfred`, snapshot of `main` pulled 2026-07-13 via codeload
(no `.git` — deliverable is a patch). cargo ABSENT; sibling `../wecanjustbuildthings.dev` ABSENT;
goose sidecar ABSENT; no browser. Consequences: `test:rust`, `check:exclusion*`, Tauri desktop
walks, live-goose trio, and visual/console journey walks are **UNVERIFIED — environment** here and
route to Martin's Windows machine. Baseline vitest skips (4, all goose-sidecar-gated:
recipes.live, acp-handshake, permission-startup) are pre-existing and must not grow.

## ASSUMPTIONS (judgment calls, logged)
1. `npm ci` executed in-container to enable gates. Zero package.json/lock changes.
2. Evidence frontmatter field names (pending Martin's sign-off before commit — flagged at gate):
   `confidence` (number 0–1), `sources` (list), `valid-from`/`valid-until` (ISO date),
   `directional` (bool), `needs-caveat` (bool), `invalidated` (string reason | true).
   Additive/optional only; NOT wired into validateFrontmatterObject (load-bearing schema untouched).
3. Confidence bands: high ≥ 0.75, mid ≥ 0.40, else low; absent/malformed → unknown (never fabricated).
4. New tokens appended at end of styles.css (no collisions; last-wins safe for new names).
5. `--error` alias → `--danger` (ActionPreview referenced undefined `--error`; fallback was firing).

## ITEMS
- [x] T1 Tokens: registers, evidence states (both themes, opaque pairs), type roles, motion,
      global prefers-reduced-motion, `--error` alias, badge + action-preview classes.
- [x] T2 `src/lib/evidence.ts`: pure parse/band/flags/invalidation; malformed inputs designed.
- [x] T3 `src/lib/evidence.test.ts`: happy paths + J3 malformed set + flags + invalidated.
- [x] T4 `src/components/EvidenceBadge.tsx`: glyph + text label (+ date) per state; never color-alone;
      unmarked notes render nothing.
- [x] T5 ActionPreview: inline styles → token classes; optional `reversibility` prop; API/logic identical.
- [x] T6 `scripts/check-contrast.mjs`: WCAG-AA (≥4.5:1) check of every introduced fg/bg pair, both themes.
- [x] G1 Gates here: typecheck ✓ typecheck:mcp ✓ vitest (no new skips) ✓ build ✓ build:web ✓ contrast ✓.
- [ ] G2 Routed to Windows: test:rust, check:exclusion*, verify:all end-to-end, Tauri boot,
      visual journeys 1/4/5/6/7 (console-clean, themes, reduced-motion, mobile width), copy audit.

## DEFERRED (findings, not built this session)
Inspector popover (floating-ui exists — next slice); ambient goose-session indicator (D.5);
voice/tone copy pass (D.4); register application across app surfaces; PropertiesPanel evidence
rendering; palette-swap decision for brand accent.

## EVIDENCE
(appended per item as command → salient output)
- T1  `wc -l src/styles.css` → 10118 (was 10008; additive section, no existing lines touched).
- T2/T3  `npm run test` → "24 passed | 3 skipped (27) · 247 passed | 4 skipped (251)" — +1 file,
  +11 tests vs baseline (23/236); skips unchanged (goose-sidecar-gated: recipes.live,
  acp-handshake, permission-startup).
- T4/T5  `grep -c "style={{" ActionPreview.tsx` → 0; grep-clean (hex/TODO) on all four touched
  TS(X) files → clean; both typechecks exit 0.
- T6  `node scripts/check-contrast.mjs` → 16/16 pairs PASS, min 5.20:1, "All pairs meet WCAG AA".
- G1  `npm run build` → "✓ built in 42.10s" (advisory: Vite chunk-size note — REPORTED as
  pre-existing-style, baseline build not captured). `npm run build:web` → generateSW,
  "precache 28 entries", sw.js + workbox emitted.
- G2  UNVERIFIED — environment (routed to Windows): test:rust (cargo absent),
  check:exclusion* (sibling WCJBT absent), verify:all end-to-end, Tauri boot,
  journeys 1/4/5/6/7 visual walk, copy audit.

## PASS 2 (blessed → wired; palette swap) — 2026-07-13
- [x] T7 Brass swap: default accent #8b5cf6 → #b8863d in App.tsx + Settings.tsx (incl. theme-switch
  auto-apply + "Dark (Nostr Purple)" label retired → "Dark"); all 24 CSS violet literals → tokens
  (var(--accent[-hover|-muted]) or color-mix alpha variants); rgb-triplet forms swept; GraphView
  purple ramp → brass ramp, high-stop reads --accent-hover at init. Residual violet: NONE
  (`grep 8b5cf6|a78bfa|139, 92, 246|167, 139, 250|…` → empty).
- [x] T8 EvidenceBadge mounted in PropertiesPanel header via propertiesToObject(properties()).
- [x] T9 docs/decisions/0005-evidence-frontmatter-fields.md — Accepted; fields, bands, two-layer rule.
- Gates: contrast 20/20 PASS (accent text 6.52/5.39 ≥4.5; UI 3.22/9.48 ≥3.0); typecheck 0;
  vitest 247 passed | 4 pre-existing skips; build ✓ 33.29s; build:web ✓ (sw + workbox emitted).
- Finding: live accent change in Settings won't retint an already-open graph until remount
  (pre-existing class of limitation — graph was fully hardcoded before). Finding: dark-theme
  selection still auto-resets accent to default (inherited behavior, kept, flagged).

## PASS 3 (design-ship) — 2026-07-17
- [x] S1-F1 vault creation: canonicalize_lenient applied to BOTH sides of validate_vault_path.
      RED (verbatim pre-fix fn, standalone rustc): Err("Invalid vault path…") on the first-run
      shape; GREEN 6/6 incl. ../escape denied + sibling-prefix denied. vault_path_tests.rs
      landed (cargo execution routes to CI/laptop — no GTK link here).
- [x] S1-F2/F11 clean first-run: startup vault-open + session-tab restore gated behind
      onboarding_completed; web lock applies only post-onboarding. VERIFIED-LIVE (probe A on the
      rebuilt PWA: fresh profile → onboarding, zero unlock modals).
- [x] S1-F3 About license → AGPL-3.0-or-later (sole MIT claim). S1-F4 no-feed updater states →
      steward info line, never red. S1-F5(function) connect-errors mapper (sidecar-missing/
      spawn-denied/handshake/key-missing, setup path each) + provider→model reset. +7 tests.
- [x] S2-F6 white blocks = theme-nord odd-cell gray-50 gated only on OS prefers-color-scheme;
      Alfred themes via data-theme → near-white cells in dark notes. MEASURED red oklch(0.985…)
      in the shipped stylesheet; tokenized override; MEASURED green bg-tertiary@55%. Zero new hex.
- [x] S2-F7 Onyx marks: welcome rock (Editor.tsx) → Alfred mark (About rock died in W5);
      public/icons ×3 regenerated from the mark. Purge grep: user-facing 0 (one code comment).
- [x] S2-F8 mark re-exported 512 LANCZOS (312 KB, was 1.1 MB raw 1024).
- [x] S2 type roles (0006): @fontsource Inter + Merriweather + JetBrains Mono (OFL, bundled,
      exclusion gate green); --font-ui/--font-canon/--font-data lead with bundled faces; body →
      Inter; headings serif. VERIFIED-LIVE: welcome h1 computes "Merriweather, Georgia, …".
- [x] S2 goose panel (F5-UI/F10): all inline styles → tokenized classes; status chip (mono,
      ev-high when live); honest idle copy in the message area; terminal collapsed until a
      session is live — the dead black rectangle cannot render. Registers per 0006.
- [x] S2 contrast gate: +4 app-baseline text pairs; 24/24 PASS.
- [ ] G2 routed to Martin: fresh Windows install walk + visual light/dark walk (Stage 4 list).
- [x] S3 copy (F9): tagline + About re-anchored to canon — "for builders who direct AI to build
      software" (both Settings surfaces); banned-framing sweep clean (no magic/aura terms).
- [x] S4 gates: tsc 0 · vitest 285|4 · contrast 24/24 · build ✓ · build:web ✓ (precache 76).
      cargo test ATTEMPTED here, hits the known wall (gdk-sys: pkg-config gdk-3.0 absent) —
      UNVERIFIED in-container; exact command routed to Windows: cargo test --manifest-path
      src-tauri\Cargo.toml (expect 13 tests: 9 prior + 4 vault_path).

## PASS 4 (Calm-HUD → the shell; builder's order 2026-07-19: "beta.2 ships with the Calm-HUD") — 2026-07-19
Accountability line: the ship order demanded the direction "fully applied to the app shell (not
just tokens)"; PASS 3 delivered defect fixes + skin and carried the Pass-1 IA deferral forward
without re-surfacing it — a silent scope cut, caught by the builder on the installed candidate.
This pass builds the IA layer. Stated exclusion (not silent): Recon Readouts and automated
Fabrication Detection have no engine yet — building their frames now would be dead chrome
(brief principle 7); they land with their engines. Builder may overrule.
- [x] P4-1 Register zoning ON the shell: data-register="workshop" (sidebar wrap, main-content) /
      "instrument" (goose wrap, panel root); serif sidebar/vault headers; steel hairline rule on
      instrument containers + `.icon-bar-rule` register boundary in the rail. VERIFIED-LIVE:
      computed border-top rgb(106,163,184) = --reg-evidence-accent; sidebar header font computes
      Merriweather-first.
- [x] P4-2 Evidence shell-wide: band glyphs (◆◈◇○/⊘, shape+title never color alone) in file tree
      AND search results from a new pure index (src/lib/evidence-index.ts) over the in-memory
      content cache; 3-state filter (All / Graded only / Needs attention) with count strip +
      clear; EvidenceBadge grew a click-to-open provenance card (state/window/sources/issues,
      right-anchored). RED-first: evidence-index.test.ts written before the module (run: FAIL,
      module absent) → 8/8 green; filter semantics encoded incl. expired-window admission.
      VERIFIED-LIVE (PWA probe B): 2 glyphs, title "Evidence: 0.9 · high"; marked→2 notes,
      attention→1 note; popover text "state 0.90 · high · window 2026-07-01 → … · sources
      docs/audit/phase4.md".
- [x] P4-3 Build Memory (workshop IA surface): vault-backed dated ledger of evidence-graded
      notes (rail button + tab, GraphView pattern); serif titles, mono dates/meta, invalidated
      struck-through never deleted, honest empty state. VERIFIED-LIVE: 2 rows, dated row first
      (2026-07-01), row click opens the note.
- [x] P4-4 Ambient presence (shared IA): status-bar substrate — breathing steel dot (reduced-
      motion honored) + "session live/agent idle" (desktop-only via reactive isWebApp; the old
      non-reactive isWeb() cache rendered it on web — caught by probe, fixed) + sovereignty line
      "local vault · <name>" + note count. VERIFIED-LIVE (web): sovereign line + count render,
      presence correctly absent; presence dot itself routes to the Windows walk (goose is
      desktop-only).
- [x] P4-5 Permission gate → evidence-pack card (gate-card): action/kind/input/scope rows, mono
      keys, agent-authored fields labeled as claims (threat-model §3), Deny left of Approve,
      single-call scope stated. Live-fire routes to the Windows walk (needs a real goose
      session); default-deny logic untouched (resolvePermission path unchanged).
- [x] P4-6 Gates: tsc 0 · tsc:mcp 0 · vitest 293 passed | 4 pre-existing skips (+8 new) ·
      contrast 33/33 (added 8 glyph-on-sidebar pairs + steel-on-primary) · build ✓ · build:web ✓
      · exclusion L1/L2 ✓. Probe A (shell) + probe B (vault: full 6-step onboarding walk clean →
      seeded OPFS notes → all surfaces) both green; screenshots in session scratchpad.
- [ ] P4-G Routed to Martin: merge PR; delete draft 356213091 + tag v0.1.0-beta.2 (laptop);
      re-tag v0.1.0-beta.2 on the new main tip; fresh install walk now includes: two-register
      shell read, Build Memory with a graded note, filter cycle, provenance card, presence dot
      breathing during a live goose session, gate card on a write request.

## PASS 5 (the frame itself, for non-developers; builder's order 2026-07-19) — 2026-07-19
Mandate: Onyx's frame was built dev-for-devs; Alfred serves mainstream non-developers.
Authority: Pass-1 brief + 0006 + the builder's Apple/Android design field manual (Drive:
design-field-manual-project-knowledge.md — nav rail with icon + SHORT label (never either
alone, explicitly not a wall of text), 3–5 primary destinations, aria-current, ≥44px targets,
rem type, reduced-motion, restraint).
- [x] P5-1 Primary navigation: the 14-icon unlabeled 48px strip → a 76px labeled nav rail
      (icon + 10.5px label), grouped as the two rooms — workshop (Notes / Search / Memory /
      Graph) above, steel-ruled instrument group (Chat when enabled / Agent) below, Settings +
      panel-collapse at the bottom. semantics: <nav aria-label="Primary">, aria-current="page",
      :focus-visible rings, 52px item height. Instrument gates now use the REACTIVE isWebApp
      (old rail leaked goose/provider buttons onto the web build via the stale isWeb cache).
- [x] P5-2 Note-scoped tools off the rail: Outline / Backlinks / Properties / Shared-with-me
      (badge preserved) → contextual toolbar cluster (aria-pressed), HIG toolbar pattern.
      Bookmarks → Files | Bookmarks segmented control inside the notes panel (role=tablist).
- [x] P5-3 Gates: tsc 0 · vitest 293|4 · contrast 33/33 · build ✓ · build:web ✓.
      VERIFIED-LIVE (PWA probe): railLabels [Notes, Search, Memory, Graph, Agent, Settings];
      aria-current follows Notes→Memory; item height 52px; 4 toolbar tools; segment switches
      to Bookmarks (header follows). Screenshot probe-pass5-frame.png: labeled rail, brass
      active pill, steel register rule, serif welcome — the frame no longer reads as Onyx.
- [ ] P5-G Routed to Martin: merge PR; re-tag v0.1.0-beta.2 (fourth cut); installed walk adds:
      rail labels legible at a glance, bookmarks segment, note tools in toolbar, agent group
      below the steel rule; then Publish.

## PASS 6 (the Morning Study — Direction 1 RATIFIED by builder, 2026-07-19) — 2026-07-19
Builder's word: Direction 1 (home-first) + "allow the user to pick the name the app calls them."
Process correction now standing: built screens go back to the builder as screenshots against the
ratified mockup BEFORE merge; his merge is the sign-off.
- [x] P6-1 Home.tsx = the front door: time-of-day greeting in the builder's chosen name
      (graceful unnamed), honest subline (note count, graded count, "everything stays on this
      machine"), capture box → note (filename from first words, collision-suffixed, opens),
      "Pick up where you left off" from REAL session tabs (falls back to "In your vault" —
      label never overclaims; FileEntry has no mtime, nothing fabricated), agent resting card
      (desktop-only, breathing dot when live), Build Memory top-3, three start tiles (New note /
      Daily note / Ask the agent — web swaps agent tile for Search). Launch always lands Home;
      session tabs restore into the strip one click away.
- [x] P6-2 Nav = the mockup's study sidebar (216px): Alfred wordmark + vault subline; STUDY
      group (Home / Notes / Build Memory / Connections — Graph renamed); steel-ruled INSTRUMENT
      group (Chat / Agent, desktop, reactive gate); Settings; ambient footer (presence · notes ·
      local). Search folded behind Notes (panel search + palette); aria-current, focus-visible.
- [x] P6-3 Display name: src/lib/display-name.ts (get/set/greeting; unset → no placeholder
      names) + optional welcome-step field in onboarding + Settings→General "Your name" field.
      3 new unit tests (red first: localStorage-shim mechanism).
- [x] P6-4 Gates: tsc 0 · vitest 296|4 (+3) · contrast 33/33 · build ✓ · build:web ✓.
      VERIFIED-LIVE (PWA probe): onboarding name field → "Good morning, Martin."; nav
      [Home, Notes, Build Memory, Connections, Settings]; capture "The morning study is the
      front door now" → tab of that name; Home returns via nav; recents = session tab;
      wordmark subline de-duplicated after probe caught "vault vault". Screenshots sent to
      builder with the PR.
- [ ] P6-G Builder: compare screenshots to the ratified mockup; merge = sign-off; re-tag
      v0.1.0-beta.2 (fifth cut) → walk → Publish.

## PASS 7 (vault menu — builder's eighth-cut ruling, 2026-07-19) — 2026-07-19
Installed-walk finding (builder): vault switching was buried in the Notes-panel header and
post-onboarding there was NO way to create a vault at all. Ruled: eighth cut before publish.
- [x] P7-1 The nav's vault line ("Holmes · on this machine") is now a button → menu:
      **New vault…** (dialog: name validation with plain-language reasons, live path preview,
      creates the folder as its own vault root — createFolder(path,path), the F1 shape — and
      switches to it, tabs cleared, Home shown) · **Switch vault…** (existing picker) ·
      **Show in Explorer** (desktop only). aria-haspopup/menu roles, focus-visible, backdrop
      close.
- [x] P7-2 src/lib/vault-name.ts: validateVaultName (Windows-strict: illegal + control chars,
      reserved device names, trailing dot/space; spaces/hyphens explicitly ALLOWED — my first
      regex rejected "My Vault", caught by adding the pin test) + siblingVaultPath (probe caught
      the web bare-root case nesting the new vault INSIDE the current one; fixed to true
      sibling). 9 unit tests.
- [x] P7-3 Gates: tsc 0 · vitest 311|4 (+9) · contrast 33/33 · build ✓ · build:web ✓.
      VERIFIED-LIVE (PWA probe): menu renders (Explorer item correctly absent on web); Create
      disabled on "bad/name"; preview "Will be created at: Casebook"; after Create the whole
      shell switches — vault line, sovereign status line, Home subline all read Casebook.
- [ ] P7-G Builder: merge PR → retag (eighth cut) → walk: vault line → New vault "Casebook" →
      shell switches; Switch vault back to Holmes; Show in Explorer opens the folder → Publish.

## PASS 8 (v0.1.0-beta.3 — the first true update; builder's ship order 2026-07-20) — 2026-07-20
Defect register from the builder's installed walk of beta.2 + STEP 0 recon. Rule 9 this round:
NO push, NO tag, NO publish — commit set stays local; evidence table + GATE list to the builder.
- [x] P8-1 F12 one vault door: sidebar dropdown gains **New vault…** (same dialog as the nav
      menu, one component, one behavior); "Open another vault" renamed **Switch vault…** so
      both doors use the same verbs. Probe created a vault from EACH door (DoorOne via nav,
      DoorTwo via sidebar) — shell switched both times.
- [x] P8-2 F13 Vaults in the nav: STUDY group gains **Vaults** (aria-current, popover with
      current-vault line + New / Switch / Explorer) — the "under notes there needs to be
      another icon for vaults" ruling, done as a first-class destination.
- [x] P8-3 T7-R violet purge COMPLETE: GraphView glow now derives from the brass accent
      (hexToRgba of --accent-hover, .6/.4); onboarding SVGs recolored to the study palette
      (brass/steel), dead welcome.svg deleted. grep for #8b5cf6|#a78bfa|#6366f1|violet in
      src/ → zero.
- [x] P8-4 F14 interactive-icon contract (ADR-0007, six points): HEAD inventory swept —
      tab closes, toolbar tools, sidebar header, filter/sort, modal closes, GoosePanel ⚙/✕,
      EvidenceBadge all carry aria-labels + focus-visible.
- [x] P8-5 F16 agent discoverability: both "agent idle" renders are now real buttons —
      the status-bar agent chip opens the agent panel; a one-time dismissible hint
      (localStorage) replaces the silent resting text. Copy fact-checked against the real
      goose wiring (ACP over stdio; skills gated) — no capability overclaims.
- [x] P8-6 F15 relay-not-cloud (ADR-0007 decision 2): status-bar cloud glyph → relay
      beacon (node + signal arcs, relay-syncing/relay-waves states); FileInfoDialog cloud →
      relay; onboarding copy "Enable cloud sync" → "Sync over your Nostr relays". The words
      "cloud sync" no longer appear in the product.
- [x] P8-7 F17 skills door honest: GoosePanel idle copy says skills are locked this beta;
      docs/beta/known-issues.md explains why (capability gate, not a defect).
- [x] P8-8 F9-R metadata: package.json / Cargo.toml / vite descriptions now the one-line
      canon ("Sovereign, local-first, Nostr-native PKM for builders who direct AI to build
      software"). F18 release notes: workflow composes releaseBody from
      docs/beta/RELEASE-NOTES-<tag>.md (beta.3 notes written); F19 tag↔numeric-version map
      appended to docs/release-process.md.
- [x] P8-9 Gates + evidence: tsc 0 · vitest 311|4 · contrast 33/33 · build ✓ · build:web ✓.
      VERIFIED-LIVE (PWA probe): nav [Home, Notes, Vaults, Build Memory, Connections,
      Settings]; both vault doors create; sidebar menu [New vault…, Switch vault…, Open vault
      folder, Copy vault path]; sync button aria "Relay sync is off"; 4 toolbar aria-labels;
      no cloud copy on welcome. C1 canary at the shipped tag (ci.yml run 29699768607 at
      28a8272, rust job 88226716923):
      `test telemetry_tests::born_redacted_canary_no_secret_or_note_body_on_disk ... ok`.
      cargo test locally still walled at gdk-3.0 (container) — Windows/CI route stands.
- [ ] P8-10 F21 onboarding steward walk: LOGGED for Stage G per the register — no build
      this cut.
- [ ] P8-G GATE (builder, in order): push branch → PR → merge → tag v0.1.0-beta.3 → publish →
      updater-loop proof on the installed beta.2 (Settings → check for updates → 0.1.2 offered
      with the tester notes) → F20 delete the dryrun draft
      (`gh release delete v0.0.0-dryrun.1 --yes` or the releases page) → optionally align the
      live beta.2 body with the beta.2 notes (F18's live half).
- [x] P8-11 F22 REGRESSION (quality gate, builder-filed 2026-07-20): PWA Lighthouse perf
      0.78 / LCP 3931ms at main 4626231, masked since c0a0721 by the "first-run calibration"
      soft-fail (long stale). Recon (local Lighthouse, LCP-element audit + trace candidates +
      Playwright PerformanceObserver probes): LCP element was the 512px/312K Alfred-mark PNG
      on onboarding, paint-gated behind the whole SPA JS chain; entry bundle carried the
      full CodeMirror+Milkdown editor. Fix, four parts: (1) mark resized/quantized 312K→29K
      (+ PWA icons 88K→20K, 26K→7K, 312K→62K), served as stable /alfred-mark.png;
      (2) Editor now lazy() like the other heavy views — entry chunk 923K→416K raw;
      (3) SW register script deferred (was render-blocking ~435ms); (4) static splash in
      index.html paints the mark from raw HTML/CSS and the app's first render waits for its
      decode + one committed frame (double rAF) — kills the LCP-candidate race between the
      splash and the app's first paint (trace-verified: the race, not size, caused the
      0.99↔0.78 flapping). EXECUTED + VERIFIED-LIVE: five consecutive Lighthouse runs
      perf 0.99 / LCP 1.8s / CLS 0.02; a11y 0.95; the exact CI command
      (`lhci autorun`, assertions hard) passes; functional probe: splash retires, onboarding
      completes, capture→note opens the lazy editor. Soft-fail REMOVED from ci.yml with a
      never-again note (F22b). Precache now 5.4MB — flagged as a suspect but not what moved
      the metric; full-offline precache kept deliberately (advisory for a later round).

## PASS 9 (a11y margin — builder's order 2026-07-21: real fixes only, bars untouched) — 2026-07-21
The hard gate left a11y at exactly 0.95 — zero margin, so single-run noise could fail CI on
chance. STEP-0 recon (lhci, CI config): the WHOLE deduction was color-contrast (weight 7);
label-content-name-mismatch also failing at weight 0.
- [x] P9-1 color-contrast, at the source: .onboarding-button.primary was literal white-on-brass
      (3.22:1) — now var(--accent-text); static --accent-text token corrected #ffffff→#000000
      to match the check-contrast canon pair (black on brass 6.52:1) and the runtime
      derivation; .onboarding-name__opt dropped its opacity:0.7 de-emphasis (3.07:1 at 13px →
      text-secondary 4.90:1). Same defect class fixed on live surfaces Lighthouse couldn't
      see from page one: .unlock-submit and the user chat bubble (both white-on-brass →
      token). Onboarding vault-icon + skill-checkbox glyphs joined the token. Zero new colors.
- [x] P9-2 label-content-name-mismatch (WCAG 2.5.3): the vault-line button's aria-label was
      "Vault options" while its visible text read "Holmes · on this machine" — voice-control
      users couldn't say what they saw. New src/lib/vault-line.ts (vaultLineText/Label —
      accessible name contains the visible text), wired into App.tsx; 6 unit tests (contract
      test fails against the old constant label). +4 CSS pin tests (a11y-pins.test.ts).
- [x] P9-3 Sampling (ratified addendum): lighthouserc numberOfRuns 1→3 with EXPLICIT
      aggregationMethod "median" on every assertion — verified against lhci v0.14.0 docs that
      the default is "optimistic" (never rely on it). Bars unchanged: perf 0.90 / a11y 0.95 /
      LCP 2500 / CLS 0.10, all "error". Rule comment in the config: bars never change
      silently.
- [x] P9-4 Evidence: THREE consecutive `lhci autorun` (committed config, exit 0, zero
      assertion failures) — a11y 1.00 on all nine samples (was 0.95); perf 0.96–1.00,
      LCP 1.2–1.8s, CLS 0.02 (unchanged within noise). Both STEP-0 audits score 1 with zero
      failing items. axe (wcag2a+2aa, same page CI audits): 0 violations total. tsc 0;
      vitest 321|4 (+10); contrast 33/33; build ✓ + build:web ✓. Findings logged, not
      touched: white-on---danger buttons (~4.0:1, needs an on-danger token decision);
      orphaned .openclaw-* CSS from the deleted Phase-1 component.
- [ ] P9-G GATE: local commit only — no push, no PR, no tag. Awaiting the builder's word.
