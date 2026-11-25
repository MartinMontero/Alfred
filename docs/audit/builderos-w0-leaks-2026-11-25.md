<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# 2026-11-25 — BuilderOS W0 leaks (Alfred): goose downgrade + invisible-Unicode gaps

Scope: the two Alfred items of workstream W0 in the BuilderOS integration strategy
(`builderos-integration-audit-20261116/BUILDEROS-LESSONS-STRATEGY.md`, section W0), plus an
inventory-only pass over Alfred's copies of the banned-vendor list. Code and tests only: no
installs, no downloads, no goose launch, no pushes. Labels: EXECUTED = run in this session.
SOURCE = read from the repo. OPEN = a decision for the builder.

## 1. Re-staging no longer silently downgrades goose

**Leak (EXECUTED).** `scripts/stage-goose-sidecar.mjs` pinned `EXPECTED_GOOSE_VERSION =
'1.56.0'`, but its version check was soft: any other version printed a WARNING and was then
copied over the sidecar slot; an unreadable `--version` was staged too ("staging anyway").
This machine has goose 1.48.0 at `~/.local/bin/goose.exe`, which the script searches before
PATH, so a re-stage would have swapped the harness. Reproduced against the pre-fix script in a
scratch sandbox with a fake goose that prints `goose 1.48.0`:

```
[stage-goose] WARNING: staged goose is 1.48.0, Alfred targets 1.56.0. Re-run the live-goose tests (...)
[stage-goose] staged <sandbox>\fixtures\goose-old.exe
[stage-goose]      -> <sandbox>\src-tauri\binaries\goose-x86_64-pc-windows-msvc.exe
exit: 0
```

**Fix (SOURCE).** The check is now hard and runs before anything is computed or copied. Any
binary whose `--version` does not report exactly the pin (older, newer, a pre-release such as
`1.56.0-rc.1`, no version at all, or not runnable) is refused with exit 1, in default mode as
well as `--require`. The message names the binary, both versions, and the next step. Same
fake binary after the fix:

```
[stage-goose] REFUSED: <sandbox>\fixtures\goose-old.exe is goose 1.48.0, but Alfred pins goose 1.56.0.
[stage-goose] Nothing was staged: a mismatched sidecar would silently change the goose Alfred runs.
[stage-goose] Install goose 1.56.0, point GOOSE_BIN at it, then re-run. (...)
exit: 1
```

**Canary.** `src/lib/goose/stage-goose-sidecar.test.ts` copies the script into a temporary
sandbox (so anything it stages lands there, never in the repo), points `GOOSE_BIN` at a fake
goose that always exists (asserted before every run, so the script can never fall back to a
real goose), and checks: 1.48.0 refused in default and `--require` modes with both versions
named and nothing staged; `1.56.0-rc.1` refused; no-version refused; exactly `1.56.0`
accepted (control). The fake is a shell script on Linux/macOS and, on Windows, a one-line
program compiled with the local `rustc`. Pre-fix: 4 failed, 2 passed (`expected +0 to be 1`).
Post-fix: 6 passed.

**Behavior change the builder should know about.** `tauri dev` and `tauri build` run
`npm run stage:goose` (`tauri.conf.json` `beforeDevCommand` / `beforeBuildCommand`). On this
machine they will now stop with the REFUSED message until goose 1.56.0 is installed and
staged, because the only goose found is 1.48.0. That is the intended outcome (loud instead of
a silent downgrade); the pending local re-stage noted in CLAUDE.md is the way through. The
release lane is unaffected: it downloads goose at `GOOSE_VERSION` and stages that binary.

## 2. Invisible-Unicode scanner gaps closed

**Where (SOURCE).** One shared sanitizer, `src/lib/security/invisible-chars.ts`, feeds the
skill scan (`src/lib/skills/skill-scan.ts`), the recipe scan and pre-flight preview
(`src/lib/goose/recipe-scan.ts`), and durable-memory review (`src/lib/agentic/memory-review.ts`,
used by the MCP `memory_bank_update` chokepoint). Fixing it once covers all three. No other
copy of an invisible-character list exists in Alfred (the Rust side has none).

**Ranges added (names and categories checked against Python `unicodedata`, UCD 15.1.0, and
Node ICU, Unicode 17.0):**

| Range | What it is | Severity | Why |
|---|---|---|---|
| U+2028, U+2029 | LINE / PARAGRAPH SEPARATOR (Zl, Zp) | warning | A line break to some renderers and parsers, ordinary text to YAML 1.2, so the layout a person sees can differ from the parse |
| U+2065 | unassigned, default-ignorable | stripped | Invisible slot in the invisible-operator block; no legitimate use |
| U+206A-U+206F | deprecated format controls (Cf) | stripped | Deprecated, invisible, no legitimate use in machine input |
| U+FFF9-U+FFFB | interlinear annotation controls (Cf) | warning | A renderer may hide annotated text that the model still reads |
| U+180B-U+180D, U+180F | Mongolian free variation selectors (Mn) | warning | Invisible selectors usable as a covert channel; legitimate in Mongolian, so flagged for a person rather than silently removed |
| U+1D173-U+1D17A | musical format controls (Cf) | stripped | Invisible, no legitimate use in machine input |
| U+E0080-U+E00FF | unassigned, default-ignorable, right after the Tags block | warning | The Tags smuggling trick extended to byte values 0x80-0xFF |

"Stripped" means removed before anything parses or reads the text and reported as a notice;
"warning" means kept, flagged, and blocking until a person acknowledges it, then removed
before execution or install. Memory review rejects any finding of either kind.

**Canaries.** One planted canary per range in both consumers, sharing the table in
`src/lib/security/invisible-canaries.fixture.ts`; every code point of each range is planted,
so a partial fix still fails. `src/lib/skills/skill-scan.test.ts` (7, through `scanSkill`,
the consent model, and `fullyCleanSkill`) and `src/lib/goose/recipe-scan.test.ts` (7, through
`scanRecipe`, `buildRecipePreview`, and `fullyClean`). Plus a naming test and a VS1-VS16
characterization test in `src/lib/security/invisible-chars.test.ts`. Pre-fix: all 14 range
canaries and the naming test fail (`expected [] to deeply equal [ 8232, 8233 ]` and so on:
nothing caught). Post-fix: all pass.

**OPEN — variation selectors VS1-VS16 (U+FE00-U+FE0F), deliberately unchanged.** They are
allowed today because emoji (the red heart emoji is U+2764 followed by U+FE0F) and CJK text use them
legitimately, so flagging them would put a warning on ordinary text. The cost: they are also
invisible, and a run of them can carry hidden data (16 values per character). Options for the
builder: keep allowing them (current); allow them only directly after a character that has a
standardized variation sequence and flag the rest; or flag runs of two or more. The
characterization test pins the current behavior so any change is deliberate.

**Still uncovered after this change (EXECUTED: every default-ignorable or format code point
run through `sanitize`), for a later pass:** U+E01F0-U+E0FFF (3,600 unassigned default-ignorable
code points, the same class as U+E0080-U+E00FF and the largest remaining gap); U+FFF0-U+FFF8
(unassigned, default-ignorable); U+1BCA0-U+1BCA3 (shorthand format controls); U+13430-U+1343F
(Egyptian hieroglyph format controls); and the visible prepended concatenation marks
U+0600-U+0605, U+06DD, U+070F, U+0890-U+0891, U+08E2, U+110BD, U+110CD (low risk). Plus
VS1-VS16 above.

## 3. Inventory: Alfred's copies of the banned-vendor list (no changes made)

Merging these is W1 (needs decision record 0011). Line numbers are at commit `8061c02`.

**Runtime enforcement (Alfred decides a refusal from its own list):**
- `src-tauri/src/direct_chat_policy.rs:24-36` — `ExcludedVendor` enum (Meta, OpenAI, xAI) and display names.
- `src-tauri/src/direct_chat_policy.rs:50-52` — provider-name tokens: `openai`, `azureopenai`, `codex` / `xai`, `grok` / `metaai`, `metallama`.
- `src-tauri/src/direct_chat_policy.rs:56-64` — endpoint hosts: `openai.com`, `openai.azure.com`, `oai.azure.com` / `x.ai` / `meta.com`, `meta.ai`, `llama.meta.com`, `llama-api.com`, `llamaapi.com`.
- `src-tauri/src/direct_chat_policy.rs:125-175` — model-id rules: `gpt-3/4/5/oss/image/audio/realtime` (133-139), o1-o4 (140-148), `openai`/`chatgpt`/`davinci`/`codex` (149-156), `grok` (161), `xai` token (166-172).
- `src/lib/agentic/memory-review.ts:46` — memory-poisoning regex: `allow|enable (openai|meta|xai)`.

**Delegated (no list in Alfred; the copy lives in Holmes):**
- `src-tauri/src/guard.rs:166-176` — `holmes_core::provider::PERMITTED_PROVIDERS`, `PERMITTED_MODEL_FAMILIES`, `PROVIDER_CREDENTIAL_KEYS`.
- `src-tauri/src/guard.rs:227-234` — goose-config startup scan via `holmes_guard::policy::model_family_excluded`.
- `src-tauri/src/guard.rs:442` — `holmes_guard::policy::PROVIDER_SELECTING_ENV_VARS`.

**Generated or user-facing text restating the list:**
- `src/lib/agentic/topology.ts:84-90` — scaffolded constitution text. Lines 89-90 say "Permitted AI providers: Anthropic + Google + local (Ollama)", which is the allowlist-of-three wording the DECISIONS block rejects (the rule is a denylist of Meta, OpenAI, xAI).
- `src/lib/agentic/spec-kit.ts:92` — spec template line "No Meta / OpenAI / xAI deps".
- `src/components/GoosePanel.tsx:393` — UI hint "(Meta/OpenAI/xAI are excluded)".
- `src-tauri/src/direct_chat_policy.rs:256` — refusal message text.

**Stale or pointer comments:**
- `src/platform/types.ts:207-209` — says the BYOK path is gated by an allowlist in `src/lib/ai-credentials.ts` "(Anthropic + Google + local/Ollama only)"; `src/lib/ai-credentials.ts:19-23` says that TypeScript policy was removed and moved to Rust. Stale, and allowlist wording.
- `src/lib/goose/acp-client.ts:115-116`, `src/platform/tauri/ai.ts:9`, `src/lib/ai-credentials.ts:20-23` — pointers only, no list.

**Permitted-roster copies (the allow side; will drift with the lists above):**
- `src/components/GoosePanel.tsx:56-63` — `PROVIDER_LABELS` (display names only; the roster itself is read from the guard).
- `scripts/artifact-guard-probe.mjs:177` — expected roster `anthropic, google, deepseek, qwen, mistral, ollama`.

**Test and CI fixtures carrying their own copy:**
- `src-tauri/src/direct_chat_policy_tests.rs` (41 matching lines, from 44), `src-tauri/src/guard_tests.rs` (23, e.g. 40-48).
- `scripts/artifact-guard-probe.mjs:129-133, 185-244`; `.github/workflows/ci.yml:272-274` (hostile `GOOSE_PROVIDER=openai`, `OPENAI_API_KEY`, `XAI_API_KEY`).
- `src/lib/agentic/memory-review.test.ts:26,52`; `mcp/server.test.ts:180,185`; `src/lib/agentic/topology.test.ts:51-52`; `src/lib/agentic/spec-kit.test.ts:45`.

**Outside Alfred, called by Alfred:** `package.json:28-29` (`check:exclusion`) runs the
WCJBT engine at `../wecanjustbuildthings.dev/enforcement/cli.ts`, which holds the
dependency-level list; the Holmes crates above hold the agentic one.

**Narrative restatements:** `CLAUDE.md:45,82` and `AGENTS.md:43,80` (constitution and
DECISIONS text), plus older audit notes and ADRs.

## 4. How the checks were run (safety)

- `src/lib/goose/recipes.live.test.ts` runs the real goose if it finds one, and it looks in
  `~/.local/bin`, where this machine has goose 1.48.0. `npx vitest run src/lib/goose`,
  `npx vitest run src`, and `gate.ps1` all include that test. Every vitest and gate run here
  used a process-only environment with `USERPROFILE`/`HOME` pointed at an empty scratch
  folder (so the live test skips), `CARGO_HOME`/`RUSTUP_HOME` set to their real paths,
  `npm_config_offline=true`, and `CARGO_NET_OFFLINE=true` (so nothing could download). The
  live test reported `2 skipped` in every run; goose was never started.
- This worktree has no `node_modules`; `npx` resolved the main checkout's existing vitest
  4.1.11 by walking up (probed with `npx --no` first, which refuses to download).
- A fresh worktree has no staged sidecars, and Tauri's build script requires them before
  `cargo test` can compile. Placeholder files (CI's approach) would be found by the live-goose
  test above and fail it, so the gate ran with `TAURI_CONFIG` removing `externalBin` and
  `resources` for that process only. No Rust test reads those settings (they take paths as
  arguments).
- `cargo` rewrote `src-tauri/Cargo.lock`'s own `alfred` entry from 0.1.4 to 0.1.5: pre-existing
  drift from the release bump in `509f8bb`, which did not update the lock. Not committed here.

## 5. Results and RECIPE.md drift check

EXECUTED in this worktree with the environment in section 4: `npm run typecheck` exit 0;
`npx vitest run src/lib/skills` exit 0 (2 files, 25 tests); `npx vitest run src/lib/goose`
exit 0 (6 files passed, the live-goose file skipped; 48 tests passed, 2 skipped);
`powershell -ExecutionPolicy Bypass -File gate.ps1` printed `10/10 subsystems PASS` and exited
0 (`cargo test`: 65 passed).

- **goose/ACP sidecar** — re-verified, not drifted: both pins still `1.56.0`;
  `npx vitest run src/lib/goose` exits 0 (now including the stage canary); both named cargo
  tests exist (`guard_tests.rs:386`, `:424`).
- **Skills/Skillsmith integration** — re-verified, not drifted: `npx vitest run src/lib/skills`
  exits 0 with the planted canaries; `package.json` has 0 `@skillsmith`.
