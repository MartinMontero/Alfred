# Safety-spine source verification

**Purpose.** An upstream analysis marked Alfred's safety spine `[DIRECTIONAL]` / unverifiable
without reading this repo. This pass reads it and resolves seven inherited claims to
**VERIFIED-IN-SOURCE / CONTRADICTED / UNVERIFIED** against the real tree.

**Verdict date:** 2026-07-13; **runtime re-verification 2026-07-14.** **Ground truth:** HEAD
`224e624`, branch `claude/alfred-project-status-63gf68`, clean tree. **HEAD is 31 commits AHEAD of
`origin/main` (`2676315`), 0 behind** — the safety spine lives on this feature branch, not yet
merged to main. **Hosts:** source reads + JS fail-tests on the Linux container at
`/home/user/Alfred`; **Windows-only runtime rows were then RE-EXECUTED on the builder's Windows 11
laptop AT THE AUDITED COMMIT `224e624` (2026-07-14, goose 1.41.0 staged + hash-verified)** — raw
output in the final section. The source→runtime gap for rows 2/4/5 is closed at this commit; the
source→artifact gap (no built/signed `.exe` inspected) remains open.

**What "VERIFIED-IN-SOURCE" means and does not mean.** It proves the code SAYS this and EXISTS at
HEAD. It does NOT prove (a) the same guarantee survives in the built/signed artifact (no signed
`.exe` exists — Stage E), or (b) runtime behavior. Those two gaps stay explicit and open below.

## Evidence table

| # | Claim | Verdict | Evidence (file:line) | Notes / correction |
|---|---|---|---|---|
| 1 | `LICENSE` is AGPL-3.0-or-later | **VERIFIED-IN-SOURCE** | `LICENSE:1` "GNU AFFERO GENERAL PUBLIC LICENSE Version 3"; `package.json:31` `"license":"AGPL-3.0-or-later"` | LICENSE text is canonical AGPLv3; the "-or-later" is declared in package.json + per-file SPDX headers. Parent onyx MIT preserved as attribution in `THIRD-PARTY-NOTICES/`. |
| 2 | Windows Job Object guard kills orphaned goose on parent exit | **VERIFIED-IN-SOURCE + EXECUTED at `224e624`** (Windows, 2026-07-14) | `src-tauri/src/job_guard.rs:68-83` (real `CreateJobObjectW` + `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`); wired at `lib.rs:1105`; test `job_guard_tests.rs:24-79` | The test **exercises the kill path**, not mere construction: spawns a real child, `AssignProcessToJobObject`, asserts it is alive, `CloseHandle(job)`, then asserts the child **dies within 5s** (panics otherwise). Nuance: it uses an INDEPENDENT job + throwaway child (not the goose spawn). So goose-specific orphan-death = composition of (test-proven OS mechanism) + (source: self assigned at startup) + (source: goose spawned as child). `#![cfg(windows)]`; `closing_job_handle_kills_member_process ... ok` at the audited commit (raw output below). |
| 3 | Recipe scanner strips/flags invisible & deceptive Unicode; sub-recipe escape hole closed | **VERIFIED-IN-SOURCE** (executed here) | `src/lib/security/invisible-chars.ts:51-104`, `src/lib/goose/recipe-scan.ts:337-393` | Fail-test output below: zero-width U+200B **stripped**; bidi U+202E **flagged (warning)**; Tags-block U+E0041 **flagged + decoded → 'A'**. Staging **rewrites** the sub_recipe path `../../evil/child.yaml` → `./recipe-1.yaml` (no `../` escape) and sanitizes the child. Classes covered: 21 strip code points, bidi 202A–202E/2066–2069, Tags block E0000–E007F (decoded), supplementary variation selectors E0100–E01EF. |
| 4 | Deny-by-default permission gate: exact-match, all three lists, honest goose-start test | **VERIFIED-IN-SOURCE + EXECUTED at `224e624`** (Windows, 2026-07-14) | `src/lib/goose/tool-gate.ts:90` (`Set.has` exact match, not substring), `:126-128` (three lists emitted; `never_allow: []` intentional per goose schema) | `tool-gate.test.ts` 8/8 pass (incl. look-alike-name rejection). On Linux `permission-startup.test.ts` **skips honestly** (no staged binary). On Windows at the audited commit the **real goose 1.41.0** was launched against the REAL `buildPermissionYaml()` output: ACP initialize, no panic (964ms, pass). Bonus receipt: `acp-handshake` proves the advertised provider list is **denylist-filtered at the live protocol boundary**. Full suite 258/258, ZERO skipped. |
| 5 | Born-redacted telemetry: single-writer, opt-in/off-by-default, byte-scan canary reads the RIGHT bytes | **VERIFIED-IN-SOURCE + EXECUTED at `224e624`** (Windows, 2026-07-14) | `telemetry_tests.rs:99-140` (canary), `:113-133` (anti-blind control), `:146-158` (off⇒zero), `telemetry.rs:231-242` + `lib.rs:1048-1049` (opted-out ⇒ db never opened) | The canary is NOT blind: it writes the SAME secret into a **control db** and asserts the scan CATCHES it (`any_file_contains(&control, &canary_secret)` must be true) before asserting the real db + **WAL/SHM sidecars** contain neither canary. Off/absent/garbage settings ⇒ OFF (deny-by-default). Cannot run `cargo` on the Linux host (crate needs GTK/`gdk`); at the audited commit on Windows **all 9 Rust tests pass**, incl. the canary + opt-in-inert (raw output below). The patched `bytes 1.12.1` / `time 0.3.53` from Cargo.lock were the versions actually fetched and compiled. |
| 6 | MCP vault tools are path-confined | **VERIFIED-IN-SOURCE** (executed here) | `mcp/vault-fs.ts` `VaultFs.resolve`; `vault-fs.test.ts` 17/17 | Live escape fail-test below: `../`, `..\`, `/etc/…`, `C:\…`, nested `../../`, and UNC `\\…` **all blocked** (`VaultPathError`); a legit path resolves. **11 tools**: 6 read (`vault_search`, `vault_read`, `frontmatter_get`, `memory_bank_read`, `hot_read`, `spec_read`), 5 write (`vault_append`, `vault_patch`, `vault_write`, `frontmatter_set`, `memory_bank_update`). |
| 7 | Rule 9 is a commit gate that "provably cannot be bypassed" | **CONTRADICTED** | no `.husky`, no `.git/hooks/pre-commit`, no `.githooks`, no husky/prepare in `package.json`; `CLAUDE.md:43` | **Correction:** there is NO mechanical, un-bypassable commit interceptor. Rule 9 is a **documented operating rule** (CLAUDE.md constraint 9, "Builder agency & transparency") upheld by agent adherence, plus the **runtime deny-by-default tool-permission gate** for what an agent may execute. Neither is a git-level commit gate. The "provably cannot be bypassed" framing overstates; the honest claim is "a documented convention + deny-by-default at the tool layer." |

**Vendor policy (recorded):** `provider-policy.ts:39` `ExcludedVendor = 'meta' | 'openai' | 'xai'`
(exactly three). Google **permitted** (`:9`). **No Meta model-id rule** (`:97-99`): Llama-family ids
on permitted infra (Ollama/Groq/Together/…) are **ALLOWED** — Meta-the-vendor is excluded only via
`META_HOSTS` (`:64` meta.com/meta.ai/llama.meta.com/llama-api.com/llamaapi.com) and
`META_PROVIDER_TOKENS` (`:58` metaai/metallama). This is the honest "Llama-on-permitted-infra is
allowed" boundary, not an allowlist of three.

## What this pass CANNOT close (gaps left explicit and open)

- **Source → artifact.** All verdicts are against the source tree at HEAD `224e624`. No built or
  signed `.exe` was produced or inspected; the same guarantees in a distributed artifact are
  UNVERIFIED (Stage E — release/signing, out of scope here).
- **Source → runtime: CLOSED at the audited commit (2026-07-14).** Rows 2, 4, and 5 were
  re-executed on the builder's Windows 11 laptop at HEAD `224e624` after a verified fast-forward
  (`069b0fb..224e624`) and fresh `npm ci`: vitest **258/258, zero skipped** (the live-goose trio —
  `permission-startup`, `acp-handshake`, `recipes.live` — EXECUTED against staged, hash-verified
  goose 1.41.0), `cargo test` **9/9 ok**. One residual nuance stays recorded in row 2: the Job
  Object test proves the OS kill mechanism with a throwaway child, not the literal goose spawn.
- **Explicitly out of scope (not started):** the artifact-level denylist guard test in CI (Phase 6),
  the signed update channel / release pipeline (Stages D–E), the three locks (ADR-0003), and any
  egress-from-built-artifact adversarial run.

## Raw fail-test / canary output (rows 3–6)

### Row 3 — scanner fed a real payload (zero-width + bidi + Tags-block) and a sub-recipe escape
```
--- sanitize ---
findings: ZERO WIDTH SPACE/stripped | RIGHT-TO-LEFT OVERRIDE/warning | U+E0041 (UNICODE TAG)/warning=>A
zero-width stripped (U+200B gone from clean): true
bidi flagged as warning: true
tag-block flagged+decoded: true
--- sub-recipe staging ---
parent staged path        : /stage/recipe-0.yaml
rewritten to ./recipe-N   : true
still escapes to ../../evil: false
staged files              : /stage/recipe-0.yaml, /stage/recipe-1.yaml
child zero-width removed   : true
```

### Row 4 — permission gate (exact-match + three lists) and honest goose-start skip
```
Linux (container):
  tool-gate.test.ts        Tests  8 passed (8)
  permission-startup.test.ts   Test Files  1 skipped (1)  |  Tests  1 skipped (1)
    (skips on Linux: sidecar binary unavailable — runs in local verify:all on Windows)
```

### Row 5 — telemetry canary (anti-blind control in source)
```
telemetry_tests.rs:113   // GUARD against a blind scan: write the SAME canary RAW into a scratch db
telemetry_tests.rs:126   assert!( any_file_contains(&control, &canary_secret), ... )   // scan CATCHES it
telemetry_tests.rs:139   assert!(!any_file_contains(&db, &canary_note),   "…leaked to telemetry.db")
telemetry_tests.rs:140   assert!(!any_file_contains(&db, &canary_secret), "…leaked to telemetry.db")
lib.rs:1049              return Ok(());  // opted out: telemetry.db is never opened or created
(cannot execute cargo on the Linux container — crate requires GTK/gdk to build; live run below)
```

### Row 6 — live vault-path escape attempts (each must be blocked)
```
escape "../etc/passwd"          blocked=true
escape "..\\windows\\system32"  blocked=true
escape "/etc/shadow"            blocked=true
escape "C:\\secrets"            blocked=true
escape "notes/../../escape"     blocked=true
escape "\\\\UNC\\share"         blocked=true
legit brain/hot.md resolves => /vault/brain/hot.md
mcp/vault-fs.test.ts     Tests  17 passed (17)
```

### Windows runtime re-verification AT THE AUDITED COMMIT (2026-07-14, builder's laptop)

```
git pull origin claude/alfred-project-status-63gf68   Updating 069b0fb..224e624  Fast-forward
git rev-parse --short HEAD                            224e624
npm ci                                                added 790 packages; patch-package 8.0.1 (2 patches OK)
npm run stage:goose                                   [stage-goose] goose 1.41.0 matches the target.
                                                      src-tauri\binaries\goose-x86_64-pc-windows-msvc.exe

npm run test (vitest v4.1.9)                          Test Files 28 passed (28) | Tests 258 passed (258) | 0 skipped
  acp-handshake.test.ts    ✓ initializes and creates a session over stdio, and the advertised
                             provider list is denylist-filtered (364ms)
  recipes.live.test.ts     ✓ 2 tests (134ms)
  permission-startup.test.ts ✓ starts the staged goose sidecar against the REAL
                             buildPermissionYaml() output (ACP initialize, no panic) (962ms)
  provider-policy diagnostic table: every OpenAI/xAI/Meta surface BLOCKED (api.openai.com,
  api.x.ai, openai/azure_openai/codex*/xai*, gpt-4o/o3/grok-3); permitted providers ALLOWED
  (openrouter, mistral, ollama, groq, together, fireworks, deepseek, …); Llama-on-permitted-infra
  ALLOWED (groq/llama-3.1-8b, together/meta-llama/Llama-3-70b, ollama/llama3).
  MUST-STAY-BLOCKED failures: 0.  MUST-BE-ALLOWED false positives: 0.

cargo test --manifest-path src-tauri\Cargo.toml       test result: ok. 9 passed; 0 failed
  test job_guard_tests::closing_job_handle_kills_member_process ... ok
  test telemetry_tests::born_redacted_canary_no_secret_or_note_body_on_disk ... ok
  test telemetry_tests::opt_in_inert_writes_zero_rows_when_disabled ... ok
  (plus opt_in_gate_is_deny_by_default, prune_drops_events_outside_retention,
   tap_wire_shape_deserializes_and_chains, metrics_and_export_emit_only_typed_fields,
   events_correlate_by_trace_id_into_one_chain, wipe_removes_rows_and_seeded_records_from_bytes)
  Downloaded/compiled: bytes v1.12.1, time v0.3.53 (the Cargo.lock security patches, live)
```

## Summary

- **VERIFIED-IN-SOURCE:** rows 1, 3, 6 (rows 3/6 also executed as live fail-tests on the container).
- **VERIFIED-IN-SOURCE + EXECUTED at the audited commit `224e624`:** rows 2, 4, 5 — re-run on
  Windows 2026-07-14 with goose 1.41.0 staged and hash-verified; vitest 258/258 with zero skips,
  cargo 9/9. The former UNVERIFIED-runtime caveat on these rows is closed.
- **CONTRADICTED:** row 7 — Rule 9 is a documented rule + deny-by-default tool gate, NOT a
  provably-un-bypassable commit gate.
- **UNVERIFIED (structural, still open):** source→artifact — no built or signed `.exe` was
  produced or inspected in this pass (Stage E territory).
