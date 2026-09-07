<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# Contributing to Alfred

Alfred is a solo-builder project with agent assistance; contributions are reviewed by
Martin, and the rules below are how work gets accepted. The standing constitution is
[`CLAUDE.md`](CLAUDE.md) — read it before non-trivial work; its non-negotiable
constraints win over anything here.

## Prerequisites

The toolchain (native Windows 11, Node ≥ 22.12, Rust `stable-msvc`, VS Build Tools,
WebView2) and the build commands are documented in [`README.md`](README.md). Start
there.

## Sibling checkout (required for the exclusion gates)

The vendor-exclusion checks run the platform's own enforcement engine, referenced by
path:

```powershell
# Alfred must sit next to the platform repo:
git clone https://github.com/MartinMontero/wecanjustbuildthings.dev ..\wecanjustbuildthings.dev
npm ci --prefix ..\wecanjustbuildthings.dev --ignore-scripts
```

Without that sibling folder, `npm run check:exclusion`, `npm run check:exclusion:l3`,
and therefore `npm run verify:all` cannot run locally. CI clones it for you
(`.github/workflows/ci.yml`); a local checkout is a one-time setup.

## Running the gates

Two gates, different jobs — keep both green:

```powershell
# Correctness gate: typecheck (src + mcp), vitest, cargo tests, exclusion checks,
# guard-boundary check, and both builds (desktop + internal web harness).
npm run verify:all

# Definition-of-done gate: runs RECIPE.md's proof lines for all 10 subsystems.
# Must print "10/10 subsystems PASS" and exit 0 before you claim done.
powershell -ExecutionPolicy Bypass -File gate.ps1

# Prove the gate can fail: plants a drifted proof, watches FAIL fire, restores, re-runs clean.
powershell -ExecutionPolicy Bypass -File gate.ps1 -SelfTest
```

Note the live-gated tests: three vitest suites (`permission-startup`, `acp-handshake`,
`recipes.live`) and parts of the Rust suite only execute on Windows with the staged
goose sidecar (`npm run stage:goose`). A green run where they skipped is
green-by-skip for goose behavior — say so if that's what you ran
(`docs/audit/phase5.md` names this risk).

## The RECIPE.md / PLAN.md convention

- **Read [`RECIPE.md`](RECIPE.md) before any work.** It is the persistent dependency
  graph of record: every subsystem, what must work first, and a checkable proof line
  (a number, a filename, or a named output — never a vibe).
- **The session's `PLAN.md` is a subset of `RECIPE.md`**: only the subsystems being
  touched, in dependency order, with the proof lines carried forward unchanged.
- **Drift rule:** any change that touches a subsystem re-verifies its proof line; a
  drifted proof is flagged in the PR body, never silently edited. If the work touches
  a subsystem not in RECIPE.md, add the row (with a proof) in the same PR.

## Branches, commits, and PRs

- **Branch from `main`.** Cut feature branches off `main`, never off an unmerged
  feature branch.
- Keep commits scoped and honest: red-first evidence for fixes where practical, and no
  claim of "done" without the gates above.
- **Rule 9 (builder agency):** no merges to `main`, no tags, no releases, and no
  pushes that publish anything without Martin's explicit go-ahead. Open the PR,
  present the evidence, and leave the final say with the builder. The same applies to
  environment changes, destructive actions, and anything outward-facing — state what
  and why, then ask first.

## The denylist (absolute)

- No dependency, import, endpoint, or config — direct or transitive — for **Meta,
  OpenAI, or xAI**. Google is permitted. The exclusion checks above enforce this;
  never suppress or allowlist an exclusion failure without a recorded decision.
- **Zero Soapbox:** nothing from the Soapbox/Nostrify ecosystem
  (`@nostrify/nostrify`, `@soapbox.pub/*`, `@soapbox/*`, `jsr:@soapbox/*`) in deps or
  dev tooling.
- **No React** (Meta-owned), including transitive React (audit `qrcode.react`-class
  packages before adding).
- New dependencies, new Nostr event kinds, and schema changes are **stop-and-ask**
  items: open a decision doc under `docs/decisions/` and wait for sign-off.

## License

Alfred is AGPL-3.0-or-later. Every new file carries the SPDX header shown at the top
of this file. Contributions are accepted under the same license.
