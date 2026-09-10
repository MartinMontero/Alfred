<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# RECIPE.md — Alfred's persistent dependency graph

This is the project's graph of record. **Read it before any work.** Each row names a real
subsystem (verified against source, configs, and scripts — not the README), what must work
first ("Needs"), and a checkable proof. A proof ends in a number, a filename, or a named
output — never a status message. `gate.ps1` (repo root) runs every proof line; the session's
PLAN.md is a subset of this table covering only the subsystems being touched, in dependency
order, with the proof lines carried forward.

Rows are in dependency order: nothing in a row's "Needs" appears below that row.

| Subsystem | Needs | Proof |
|---|---|---|
| Tauri 2 shell (config, permissions) | — (root) | `src-tauri/tauri.conf.json` parses and sets `identifier` = `dev.wecanjustbuildthings.alfred` with `bundle.externalBin` containing `binaries/goose`; `src-tauri/capabilities/default.json` lists the `updater:default` permission |
| Frontend layer (SolidJS + Vite, `@platform` dual target) | Tauri 2 shell | `npm run typecheck` exits 0 and `npx vitest run src` exits 0 with 0 failed test files |
| Memory/vault layer (frontmatter/evidence, `mcp/` server, Rust telemetry store) | Frontend layer | `npm run typecheck:mcp` exits 0 and `npx vitest run mcp` exits 0 across the 5 MCP test files (server, vault-fs, search, markdown, naddr) |
| goose/ACP sidecar (stage-goose-sidecar, `src/lib/goose`, pinned goose + bundled MCP) | Tauri 2 shell, Memory/vault layer | `scripts/stage-goose-sidecar.mjs` pins `EXPECTED_GOOSE_VERSION = '1.48.0'` AND `.github/workflows/release.yml` pins `GOOSE_VERSION: '1.48.0'`; `npx vitest run src/lib/goose` exits 0; shipped MCP path is npx/tsx-free, pinned by cargo tests `bundled_mcp_invocation_uses_the_pinned_runtime_and_never_mentions_npx_or_tsx` + `..._falls_back_when_the_bundle_or_runtime_is_absent` (2 tests) |
| Holmes embedding (holmes-core + holmes-guard in `guard.rs`) | goose/ACP sidecar | `src-tauri/Cargo.toml` carries exactly 2 Holmes pins, both `tag = "v1.0.0-rc.1"` on `MartinMontero/Holmes.git`; `npm run check:guard-boundary` exits 0 printing `Guard boundary clean`; `cargo test --manifest-path src-tauri/Cargo.toml` exits 0 |
| Updater (tauri-plugin-updater, self-authored `latest.json` feed, rollback path) | Tauri 2 shell | `tauri.conf.json` `plugins.updater.endpoints[0]` ends with `/releases/latest/download/latest.json` and `plugins.updater.pubkey` is non-empty; `npx vitest run src/lib/updater-feed.test.ts src/lib/updater-messages.test.ts` exits 0; rollback rule `refuses same-or-lower version numbers` appears in `docs/beta/rollback-checklist.md` |
| Tauri Rust/JS alignment guard (`check:tauri-align`) | Tauri 2 shell | `npm run check:tauri-align` exits 0 and its stdout matches `All \d+ tauri Rust/JS pairs aligned` |
| CI five-job gate (verify / rust / artifact-guard / supply-chain / quality) | Frontend layer, Memory/vault layer, Holmes embedding, Tauri Rust/JS alignment guard | `.github/workflows/ci.yml` defines exactly the 5 jobs `verify`, `rust`, `artifact-guard`, `supply-chain`, `quality`, and 100% of its `uses:` lines are pinned to a 40-hex commit SHA |
| Release lane (`release.yml`, ADR-0009 feed authorship + regression gate) | CI five-job gate, goose/ACP sidecar, Updater | `.github/workflows/release.yml` pins `GOOSE_VERSION: '1.48.0'`, invokes `updater-feed.mjs build` and `updater-feed.mjs verify`, and 100% of its `uses:` lines are pinned to a 40-hex commit SHA |
| Skills/Skillsmith integration (scan + registry + consent; Skillsmith external-npx-only) | goose/ACP sidecar, Frontend layer | `npx vitest run src/lib/skills` exits 0 (skill-scan incl. planted invisible-Unicode canaries, skill-registry) and `package.json` contains 0 occurrences of `@skillsmith` |

## Parallel tracks

The **Tauri 2 shell** is the universal root — every track shares it, so it is discounted when
naming parallel tracks. Beyond it:

- **Updater** and the **Tauri Rust/JS alignment guard** depend on the shell alone. They share
  zero dependencies with the **Memory/vault → goose/ACP sidecar → Holmes embedding → Skills**
  chain, and zero with each other. All three tracks can be built and re-verified in parallel.
- Within the chain, Memory/vault must precede the goose sidecar (the goose configuration wires
  Alfred's MCP server into the harness, and the recipes operate on the vault), and the sidecar
  must precede Holmes (the compiled guard is the policy layer for the goose spawn surface).
- **CI five-job gate** and **Release lane** are join points, not tracks: CI depends on the
  frontend, memory/vault, Holmes, and alignment guard; the release lane additionally depends
  on the goose sidecar and the updater feed contract.

## DRIFT RULE

Every proof line in this file is a live claim about the repo, and it decays the moment its
subsystem changes.

1. **Any PR that touches a subsystem re-verifies that subsystem's proof line** — run
   `gate.ps1` (or the specific proof) and paste the result in the PR body.
2. **A drifted proof is flagged, never silently edited.** If a proof no longer matches reality
   (a pin moved, a script was renamed, a job was added to CI), the PR body must say so in
   plain language — which proof drifted, what it claims, what is now true — and the corrected
   proof line lands in the same PR. Editing RECIPE.md to match unverified reality, or to make
   a red gate go green without the underlying check passing, is a constitution-level violation
   (zero fabrication; no silent moves).
3. **Proofs stay checkable.** A proof that cannot be run by `gate.ps1` or a named existing
   script in under a few minutes is a smell: rewrite it as a number, a filename, or a named
   output, or split the subsystem.
4. **New subsystems enter through the same door:** read the source, name the dependencies,
   write a proof that ends in a number/filename/named output, and add the row in dependency
   order — with the gate updated to run it in the same PR.
