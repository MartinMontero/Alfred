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
- **Defect found and FIXED (2026-07-12, threat model §3; builder decision: option (a)):** the
  Alfred-side `classifyToolCall` auto-allow path keyed on ACP `title`/`kind` — agent-authored
  display metadata — and answered `requestPermission` with it (spoofable). Fix (Stage B cycle 1):
  the auto-allow branch is removed from GoosePanel — every permission request goose sends is now
  answered by the human; the helper is re-scoped to `describeToolCallHint` (display-only, returns
  no decision type).
  **Proven by test:** `src/lib/goose/tool-gate.test.ts` ("enforcement is never title-keyed" pin:
  no `classifyToolCall` export + a src/-wide source scan; planted-canary fired and removed
  2026-07-12). The goose-side permission.yaml layer (id-keyed) is unchanged; the no-handler
  default remains deny (acp-client.ts:190-191).

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
- Step 5: latency–accuracy guardrail — **LANDED (deterministic core, zero-spend)** (Stage B).
  `src/lib/telemetry/guardrail.ts`: Option B — a born-redacted signal combining
  `agent_turn.durationMs` with a grounding boolean (did a read-kind tool run — ToolKind 'read'
  only, never a title/path/arg; observability heuristic, never a gate) → 'ok' | 'slow' |
  'ungrounded' | 'slow-ungrounded' (the accuracy-risk shape). Wired live through `session-tap.ts`
  (per-turn grounding, reset each turn, fired via an optional `onGuardrail` observer — NOT
  persisted) and consumed in GoosePanel as a spot-check nudge.
  **Proven by test:** `src/lib/telemetry/guardrail.test.ts` (zero-spend smoke: all four signals,
  threshold inclusivity, failed-turn exclusion, summary counts) + `session-tap.test.ts` guardrail
  cases (grounding detection + per-turn reset + content-free readout).
  **BLOCKED (Rule-9 spend, routed to Martin):** the LIVE activation capture — confirming a real
  goose turn's latency + grounding populate the signal — requires one paid provider turn on
  Windows with the sidecar. And a *persisted* guardrail metric (vs the current live-only observer)
  is a Rust telemetry-schema addition, compiled/tested on Windows — deferred, noted here.
  Note: the guardrail only fires when telemetry is opted in (the tap is inert otherwise) — it is
  part of the observability opt-in, by design.
- Step 6: context-probe harness — **LANDED** (Stage B). `src/lib/agentic/context-probes.ts`:
  recall / artifact / continuation probes over Alfred's assembled context substrate (hot.md +
  pulled files), deterministic string-presence checks (no live-LLM spend), each reporting exactly
  what is missing on failure. Source of the three probes: docs/research/atproto-case-study.md.
  **Proven by test:** `src/lib/agentic/context-probes.test.ts` — runs over real `generateHotMd`
  output; includes must-fail cases (absent fact, unreferenced file, no-substring-false-match) and
  a planted-failure canary was fired + reverted 2026-07-13. This retires the previously vacuously
  green CLAUDE.md "three context probes" gate item.
- Step 7: memory-poisoning review gate + privacy/consent — **LANDED** (Stage B).
  `src/lib/agentic/memory-review.ts`: agent-authored durable facts are never auto-promoted (queue
  for human review); obfuscation-character or policy-tamper (relax-a-security-control) writes are
  REJECTED outright. Enforced at the real chokepoint: `mcp/server.ts` `memory_bank_update` refuses
  a rejected write before it touches the vault (clean facts still provenance-stamped "review
  before trusting").
  **Proven by test:** `src/lib/agentic/memory-review.test.ts` + `mcp/server.test.ts` poisoning
  refusal cases (policy-tamper + obfuscation; planted-failure canary fired + reverted 2026-07-13).
  Honest boundary: cannot catch a false fact stated in plain visible language — that is what the
  review queue (human) is for.
- Reading UI — **LANDED** (Stage B): a desktop-only "Privacy & Telemetry" Settings section —
  plain-language opt-in toggle, Export (JSON), Erase (confirm-gated wipe), and a metrics view —
  wired to the existing registered commands (load/save_settings, telemetry_metrics/wipe/export).
  Retires "opt-in requires hand-editing settings.json." Live opt-in→record→wipe journey (J5) is a
  Windows-execution item (the Rust store isn't cargo-testable in this container; command behavior
  already proven by telemetry_tests.rs).
- Remaining to CLOSE the phase: the completion section + phase-close `verify:all` with the
  live-goose trio + cargo telemetry canary EXECUTED on Windows; the B1 paid activation turn; and
  Martin's Gate-B decision on the `engines` field (node >=22.12).
