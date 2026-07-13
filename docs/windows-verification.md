# Windows verification runbook (the routed items)

**Why this exists.** The cloud session that wrote Alfred's Phase-5 code cannot run
anything that needs the real goose sidecar, the Rust/WebKit toolchain, or a paid
provider turn. Those are collected here as one turnkey sequence for a Windows
machine — run by you, or by a Claude Code session dispatched to your laptop.
Every step says what "green" means and where to record the result.

Run from `C:\Users\User\dev\Alfred` (adjust to your checkout).

## 0. Prereqs (one-time)
- Node ≥ 22.12 (`node --version`), Rust stable-msvc (`rustc --version`), VS Build
  Tools "Desktop development with C++", WebView2 (preinstalled).
- **goose 1.41.0 installed** and on PATH (or set `GOOSE_BIN`). Confirm:
  `goose --version` → must print `1.41.0` (the target pinned in
  `scripts/stage-goose-sidecar.mjs`).
- A permitted-vendor API key in the environment for the one paid turn
  (Anthropic/Google/Mistral, or a local Ollama model for a zero-spend path).

## 1. Sync + install
```
git checkout claude/alfred-project-status-63gf68
git pull origin claude/alfred-project-status-63gf68
npm ci
```
GREEN: install completes, patches applied, no registry errors.

## 2. Stage the goose 1.41.0 sidecar
```
npm run stage:goose
```
GREEN: prints `goose 1.41.0 matches the target` and stages
`src-tauri\binaries\goose-x86_64-pc-windows-msvc.exe`. A version WARNING here
means the wrong goose is installed — fix before continuing.

## 3. Full gate with the live-goose trio EXECUTING
```
npm run verify:all
```
This is the key run: on Windows with the sidecar staged, the three tests that
SKIP in the cloud now EXECUTE. Confirm in the Vitest output that these ran
(not skipped):
- `src/lib/goose/permission-startup.test.ts` — goose ingests the generated
  `permission.yaml` without the startup panic (the never_allow regression proof).
- `src/lib/goose/acp-handshake.test.ts` — ACP initialize/newSession/approve-mode,
  and the advertised provider list is denylist-filtered.
- `src/lib/goose/recipes.live.test.ts` — the shipped recipes pass
  `goose recipe validate`.
GREEN: `verify:all` exits 0 AND those three are executed, not skipped. If any
were skipped, the sidecar isn't staged — return to step 2.

## 4. Rust telemetry byte-scan canary (born-redacted proof)
```
npm run test:rust
```
GREEN: all telemetry tests pass, especially
`born_redacted_canary_no_secret_or_note_body_on_disk` — proves no note body or
secret ever reaches the telemetry DB bytes. (This cannot run in the cloud
container — missing `gdk-3.0`.)

## 5. The one PAID activation turn (B1 guardrail — Rule 9 spend)
This is the only step that costs money (one provider turn), so it is deliberately
manual. Purpose: confirm the latency/grounding guardrail lights up on a REAL
goose turn, not just synthetic tests.
1. `npm run tauri dev`
2. Open a vault, turn Telemetry ON in Settings → Privacy & Telemetry.
3. In the goose panel, run one prompt that does NOT read the vault (e.g. a general
   question) and let it answer.
4. EXPECT: if the turn is slow and consulted no vault-read tool, the panel shows
   the "answered slowly without consulting your vault — worth a spot-check" nudge,
   and `telemetry_metrics` shows the agent_turn. Then run a prompt that DOES read
   a note and confirm that turn is treated as grounded (no risk nudge).
GREEN: the guardrail signal reflects real turn latency + grounding.

## 6. Record results
Append EXECUTED evidence (command → salient output) to LOOP.md under STAGE B, and
flip these BETA DoD lines once green:
- "verify:all green locally WITH the live-goose trio EXECUTED on this machine."
- "Sidecar pinned … goose version decision recorded (bump executed + re-verified)."
- Re-confirm the "all providers compiled in, no build flags" fact still holds for
  1.41.0 (constraint 2) — a quick check of the goose 1.41.0 build config.
Commit only on Martin's word, as always.

## What is NOT in scope here
The signed installer build, updater keypair, and PWA deploy are Stages E/F — not
this runbook. This covers only the Phase-5 verification the cloud session could
not execute.
