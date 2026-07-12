# Phase 5 — observability & agent safety (audit, IN PROGRESS)

**Status: in progress.** This is a state-of-the-tree audit written mid-phase (2026-07-12), not a
completion note. Steps 1–4 (+3b) are implemented and committed; steps 5–7 and the reading UI are
open. It will be superseded by a completion section when the phase closes.

## Shipped steps, each with its proof class

### Step 1 — input sanitation (commits 11cfcf2, beec253)
- Invisible-character sanitizer `src/lib/security/invisible-chars.ts`: STRIP table (21 code points:
  zero-width set, BOM, word-joiner class), WARN classes for bidi/Trojan-Source controls, Unicode
  Tags block (U+E0000–U+E007F) with smuggled-ASCII decode, supplementary variation selectors.
  **Proven by test:** `src/lib/security/invisible-chars.test.ts`.
- Pale-Fire recipe safety scanner `src/lib/goose/recipe-scan.ts`: sanitize-before-parse, real-YAML
  AST action enumeration, sub-recipe recursion with cycle/depth guards, `buildRecipePreview`,
  `stageCleanRecipe` (execution can never resolve back to an unsanitized file). Wired into
  `GoosePanel.tsx` via `ActionPreview.tsx` and `recipes.ts` (scan+stage before every run).
  **Proven by test:** `src/lib/goose/recipe-scan.test.ts`; live validation of the two shipped
  recipes in `src/lib/goose/recipes.live.test.ts` (LIVE-GATED, see skip risk below).

### Step 2 — deterministic tool-permission gating (commits 890346c, 45d37ad)
- goose `approve` mode (never `smart_approve`) set at session start, fail-closed;
  curated `permission.yaml` generated per session into the isolated GOOSE_PATH_ROOT:
  `always_allow` = the six read-only vault tools (namespaced `alfred-vault__*`),
  `ask_before` = the five write tools + `developer__shell`, `never_allow` = [] (required by
  goose 1.39.0's three-list schema — omitting it panics goose at startup: the regression fixed in
  45d37ad).
  **Proven by test:** `src/lib/goose/tool-gate.test.ts` (classification, YAML shape incl. the
  never_allow list); the startup-panic regression is proven ONLY by
  `src/lib/goose/permission-startup.test.ts`, which spawns real `goose acp` against the generated
  file (LIVE-GATED: win32 + staged sidecar).
- **Known defect (recorded 2026-07-12, threat model §ACP):** the Alfred-side
  `classifyToolCall` auto-allow path keys on ACP `title`/`kind` — agent-authored display metadata —
  and is used to answer `requestPermission` (GoosePanel.tsx:141). Title-keyed enforcement is
  spoofable. Fix direction is a Gate-A decision; until then no further gating work.
  The goose-side permission.yaml layer keys on stable `(extension__tool_name)` ids and is not
  affected. The no-handler default remains deny (acp-client.ts:190-191).

### Step 3 — born-redacted telemetry spine (commit ddbc85f)
- `src-tauri/src/telemetry.rs`: typed-allowlist events (counts, durations, bounded enums,
  trace/span ids — no free-text field), single-writer store (secure_delete=ON, auto_vacuum=FULL,
  WAL), gated single write path (`record_gated`), honest wipe (DELETE + wal_checkpoint(TRUNCATE) +
  VACUUM + re-checkpoint), 14-day prune, `query_by_trace`. Opt-in, off by default; `telemetry_record`
  returns without opening the DB when opted out.
  **Proven by test:** `src-tauri/src/telemetry_tests.rs` — 8 cargo tests including the byte-scan
  canary (`born_redacted_canary_no_secret_or_note_body_on_disk`), opt-in-inert, wipe-removes-bytes,
  trace-chain correlation.

### Step 3b — live session emission tap (commit 3ed7b4f)
- `src/lib/telemetry/session-tap.ts`: wraps ACP session prompt/update flow; emits agent_turn /
  tool_call / schema_validation events through `invoke('telemetry_record')` (re-gated server-side);
  armed in GoosePanel only when `telemetry_enabled === true`.
  **Proven by test:** `src/lib/telemetry/session-tap.test.ts`.
- Honest boundary: `llm_request` events are defined but never emitted — ACP exposes no per-request
  boundary; documented in the source header.

### Step 4 — SEP-414 / W3C Trace Context correlation (commit e843e05)
- `src/lib/telemetry/trace.ts` (traceparent generate/parse/childSpan; born-redacted typed baggage
  allowlist); `_meta` injection on ACP newSession/prompt (acp-client.ts); MCP server extracts and
  echoes `traceparent` (mcp/server.ts TRACE_CONTEXT_KEYS); Rust store carries trace_id/span_id
  columns (Step-4 migration).
  **Proven by test:** `src/lib/telemetry/trace.test.ts`; `mcp/server.test.ts` trace-correlation
  cases (extraction, echo, cross-carrier identity, opt-in-inert).
- Re-verify obligation: SEP-414 key names were adopted pre-release for forward-compat; the MCP
  2026-07-28 spec release mandates a re-verify pass (logged in LOOP.md dated items).

### Cross-step fix — permission.yaml never_allow (commit 45d37ad)
Covered under Step 2 above; the live proof fires only on Windows with the sidecar staged.

## The green-but-doesn't-fire risk (named per protocol)
Three tests are LIVE-GATED and **skip by design off-Windows / without the staged sidecar**:
1. `src/lib/goose/permission-startup.test.ts` (win32 + sidecar) — the only executable proof of the
   startup-panic regression fix.
2. `src/lib/goose/acp-handshake.test.ts` (GOOSE_BIN) — the only executable proof of the ACP
   initialize/newSession/approve-mode path against real goose.
3. `src/lib/goose/recipes.live.test.ts` (GOOSE_BIN) — the only executable proof that the shipped
   recipes pass `goose recipe validate`.
A green CI/vitest run **without** these is green-by-skip for goose behavior. Any release-gate claim
about goose behavior requires all three EXECUTED on a Windows machine with the pinned sidecar and
the run cited. Last known full execution: Martin's machine, REPORTED 2026-06-28 (phase-4 audit).

## Open (remaining Phase-5 work)
- Step 5: latency–accuracy guardrail (Option B, deterministic read-side; the live activation
  capture is a paid provider turn = Rule-9 spend item).
- Step 6: context-probe harness (recall / artifact / continuation) — the CLAUDE.md "three context
  probes" gate item is currently vacuously green (no probe tests exist in the tree).
- Step 7: memory-poisoning review gate + privacy/consent controls.
- Reading UI: telemetry opt-in toggle / wipe / export / metrics in Settings (commands exist and are
  registered; no UI caller — opt-in currently requires hand-editing settings.json).
- This audit's completion section + phase-close verify:all with the live trio executed.
