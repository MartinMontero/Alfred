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
