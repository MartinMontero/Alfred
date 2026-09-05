<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# 2026-09-04 — graph-engineering convention install (RECIPE.md + gate.ps1 + CLAUDE.md)

Session: 2026-09-04/05. Scope: install the graph-engineering convention — `RECIPE.md`
(persistent dependency graph), `gate.ps1` (definition-of-done gate), and the CLAUDE.md /
AGENTS.md "Project graph" sections. Additive only: no existing source file edited.
Labels: EXECUTED = read or run in session. VERIFIED-LIVE = executed against the running
system. CANON = standing constitution/ADR text. REPORTED = stated in docs, not re-verified.
UNVERIFIED = could not confirm.

## Part 1 — AUDIT (what was found before writing anything)

### Repo state

- EXECUTED: work began on branch `holmes-rc-repin` (main + the Holmes tag re-pin); PR #30
  merged it, and the convention branch was re-cut onto `main` per the builder's standing
  rule (branches cut from main, not merged feature branches).
- EXECUTED: `src-tauri/binaries/goose-x86_64-pc-windows-msvc.exe --version` reports **1.41.0**;
  the pin in `scripts/stage-goose-sidecar.mjs` and `.github/workflows/release.yml` is
  **1.43.0**. CANON (CLAUDE.md tooling table) records the Windows re-stage + live-goose
  re-verify against 1.43.0 as a known open item routed to the Windows/release lane.
  Consequence: the gate asserts the PINS (deterministic, repo-resident) and surfaces the
  staged-binary skew as a non-blocking WARN, not a FAIL — a permanently red gate on a
  documented open item would be a false signal.
- EXECUTED: `node_modules/` and `src-tauri/target/` (debug + release) exist; cargo 1.98.0;
  the sibling platform repo `../wecanjustbuildthings.dev/enforcement` exists.

### Subsystem-by-subsystem (verified by reading the actual source)

1. **Tauri 2 shell** — EXECUTED: `src-tauri/tauri.conf.json` sets `identifier`
   `dev.wecanjustbuildthings.alfred`, `bundle.externalBin: ["binaries/goose"]`,
   `plugins.updater` (pubkey + GitHub `latest.json` endpoint), `createUpdaterArtifacts: true`,
   CSP, deep-link scheme `alfred`. `src-tauri/capabilities/default.json` lists
   `updater:default`, fs scopes ($DOCUMENT/$DOWNLOAD/$APPCONFIG/$APPDATA/$HOME/.config/alfred),
   shell:allow-open. `src-tauri/Cargo.toml`: tauri 2 + 12 tauri-plugin-* crates, holmes pins,
   rusqlite bundled.
2. **Frontend layer** — EXECUTED: SolidJS ^1.9.10 + Vite 7, `@platform` alias to
   `src/platform/{tauri,web}` (dual target), `tsconfig.json` includes ONLY `src/`. Scripts:
   `typecheck`, `test` (vitest, include `src/**` + `mcp/**`), `build`, `build:web`.
3. **Memory/vault layer** — EXECUTED: `mcp/` (server.ts, vault-fs.ts, search.ts, markdown.ts,
   naddr.ts + 5 test files, own `tsconfig.json` → `typecheck:mcp`); `src/platform/*/vault*`;
   `src/lib/frontmatter.ts`, `evidence.ts`, `daily-notes.ts`, `templates.ts`;
   `src-tauri/src/telemetry.rs` (rusqlite, born-redacted) + `vault_path_tests.rs`.
4. **goose/ACP sidecar** — EXECUTED: `scripts/stage-goose-sidecar.mjs`
   (`EXPECTED_GOOSE_VERSION = '1.43.0'`, SOFT check — warns, never blocks; `--require` only
   gates absence); `release.yml` env `GOOSE_VERSION: '1.43.0'`; `@agentclientprotocol/sdk ^1.0.0`
   in dependencies; `src/lib/goose/` (acp-client, guard-transport, tool-gate, recipe-scan,
   recipes, stdio-bytes + tests); `recipes.live.test.ts` is `describe.skipIf(!GOOSE)` — runs the
   REAL `goose recipe validate` against `goose-recipes/` when a binary is staged.
5. **Holmes embedding** — EXECUTED: `Cargo.toml` pins holmes-guard + holmes-core
   `git = "https://github.com/MartinMontero/Holmes.git", tag = "v1.0.0-rc.1"` (2 pins);
   `src-tauri/src/guard.rs` (809 LOC) + `guard_tests.rs` (428 LOC); `direct_chat_policy.rs`;
   `scripts/check-guard-boundary.mjs` scans src/, src-tauri/src/, mcp/, scripts/ and exits 1 on
   any crossing. CANON: ADR-0008.
6. **Updater** — EXECUTED: `scripts/updater-feed.mjs` exports `buildFeed`/`verifyFeed` + CLI
   `build|verify` (ADR-0009 per-installer keys: nsis, msi, plain=nsis fallback; stale-merge
   catch); unit tests `src/lib/updater-feed.test.ts` + `updater-messages.test.ts`;
   `src/lib/updater.ts` three-step user-consented flow over `@tauri-apps/plugin-updater ^2.10.1`.
   Rollback path: `docs/beta/rollback-checklist.md` — forward-in-number only ("the tauri updater
   refuses same-or-lower version numbers"), dry-run J6 against a LOCAL latest.json.
7. **CI five-job gate** — EXECUTED: `.github/workflows/ci.yml` defines exactly 5 jobs:
   `verify`, `rust`, `artifact-guard`, `supply-chain`, `quality`. Every `uses:` line pinned to a
   40-hex commit SHA (the gate asserts this mechanically: 17/17 in ci.yml, 6/6 in release.yml).
8. **Tauri Rust/JS alignment guard** — EXECUTED: `scripts/check-tauri-alignment.mjs` compares
   every tauri crate ↔ JS guest pair across `Cargo.lock` ↔ `package-lock.json` on major/minor,
   exits 1 on skew; wired as `npm run check:tauri-align` and a step in the CI `verify` job
   (every push — which includes every Cargo.lock touch).
9. **Release lane** — EXECUTED: `.github/workflows/release.yml`, tag `v*` + dry-run dispatch,
   windows-latest; downloads + stages goose `$GOOSE_VERSION` with `--require`; runs `npm test`
   (live-goose recipe test executes there); tauri-action SHA-pinned, draft releases only;
   authors `latest.json` via `updater-feed.mjs build`, then downloads the feed BACK off the
   release and hard-fails `updater-feed.mjs verify` (the beta.2→beta.3 regression gate).
   CANON: ADR-0009, `docs/release-process.md`.
10. **Skills/Skillsmith** — EXECUTED: `src/lib/skills/skill-scan.ts` + `skill-registry.ts`
    (+ tests with planted invisible-Unicode canaries per CANON ADR-0003) and
    `src/components/SkillConsent.tsx`. `package.json` contains ZERO `@skillsmith` entries —
    Skillsmith is external-npx-only and auto-install wiring is OUT (ADR-0003, three locks).

### Drift found during the audit (reported, not fixed — additive-only task)

- EXECUTED: untracked `scripts/skills-probe.ts` and `scripts/skills-activate.ts` both import
  `../src/lib/goose/provider-lockdown`, which ADR-0008 RETIRED (file absent from
  `src/lib/goose/`). `tsc` never sees them (`tsconfig.json` includes only `src/`) and they are
  wired to no npm script, so the break is latent.
- REPORTED (CANON): goose 1.43.0 Windows re-stage + live-goose trio re-verify remain open
  (CLAUDE.md tooling table); the staged binary is 1.41.0 (EXECUTED, above).

### What the gate does and does not do

- DOES: run the repo's own checks where they exist (`typecheck`, `typecheck:mcp`, vitest
  subsets, `check:guard-boundary`, `check:tauri-align`, `cargo test`) instead of re-implementing
  them; assert config facts (pins, endpoints, permissions, SHA-pinned actions) by reading the
  files; print PASS/FAIL per subsystem + `X/Y subsystems PASS`; exit 0 only if all pass.
- DOES NOT: re-run `npm run verify:all` wholesale (it includes both full builds — wrong cost
  profile for a definition-of-done gate; CI owns it); touch the network; install anything;
  modify any file outside `-SelfTest`'s plant-and-restore cycle (which restores in `finally`).

## Part 2 — PLAN (the session's subset of the graph, executed as written)

| # | Subsystem touched | Needs | Proof |
|---|-------------------|-------|-------|
| 1 | `RECIPE.md` — persistent dependency graph | Part-1 audit findings (all 10 subsystems verified from source) | File exists; 10 table rows; every proof ends in a number, filename, or named output |
| 2 | `gate.ps1` — definition-of-done gate | RECIPE.md (it executes those proof lines) | `powershell -ExecutionPolicy Bypass -File gate.ps1` prints `10/10 subsystems PASS` and exits 0 |
| 3 | CLAUDE.md + AGENTS.md "Project graph" sections | RECIPE.md + gate.ps1 (they point at both) | Both files gain one `## Project graph` section; zero existing lines changed (`git diff` shows additions only) |

## Part 3 — RESULT (anti-false-green evidence, VERIFIED-LIVE)

`gate.ps1 -SelfTest` executed (exit 0). The self-test plants a drifted proof (corrupts the
identifier in `src-tauri/tauri.conf.json` inside a backup-guarded `try/finally`), watches the
gate fire FAIL, restores the file, and re-runs clean:

```
--- PLANTED RUN (identifier drifted in src-tauri/tauri.conf.json) ---
FAIL  Tauri 2 shell - identifier is 'dev.wecanjustbuildthings.alfred-DRIFT-SELFTEST'
PASS  (other 9 subsystems)
9/10 subsystems PASS
--- RESTORED src-tauri/tauri.conf.json ---
--- CLEAN RUN (after restore) ---
PASS  (all 10; cargo test 61 passed; vitest src 32 files; vitest mcp 5 files;
       guard boundary clean; 12 tauri pairs aligned; CI 17/17 + release 6/6 SHA-pinned)
10/10 subsystems PASS
=== SELF-TEST EVIDENCE ===
Planted run:  AllPass=False (expected False); 'Tauri 2 shell' FAIL fired=True (expected True)
Clean run:    AllPass=True (expected True)
SELF-TEST PASS: the gate fires FAIL on a drifted proof and returns green only when the repo is clean.
```

Restore verified byte-exact (`git diff src-tauri/tauri.conf.json` empty after the run).
Process note: the first self-test iteration FAILED — the gate's stderr capture threw on
native stderr under `$ErrorActionPreference=Stop`, and the plant wrote a BOM that broke the
Tauri build script. Both were fixed (Process-based stdout/stderr capture; no-BOM plant write)
and the gate re-proved. The green above was earned, not assumed.
