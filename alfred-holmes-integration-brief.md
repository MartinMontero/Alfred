# Alfred × Holmes — Integration Brief · Stage 1 (guard adoption · embedding · perimeter verification)

**Status:** Work order authored on the upstream pressure-testing surface, 2026-07-20, for **Claude Code sessions on the Alfred repo**; Martin merges (Rule 9 applies in Alfred exactly as in Holmes). Grounded in Holmes `main` (Phases 0–2.5 + 4 closed, PRs #7–#16) and the 2026-07-20 upstream source review of the safety layer. Confidence convention as in the canon; Alfred-internal facts are **[DIRECTIONAL]** until verified against Alfred's tree — verifying them is this brief's job.

**Why now, three facts:** (1) Holmes **RC is BLOCKED** on human-provided CI evidence of ship-shape embedding in Alfred — obligation 1 below is the unblock. (2) Alfred is **published**: real users run it today on the strippable TypeScript guard and an update channel whose signing/rollback has never been verified end-to-end. (3) One effort pays both debts.

---

## 1 — What Holmes provides (the import surface)

Add the Holmes crates as git dependencies pinned to `main` (`--locked`); AGPL-3.0-or-later on both sides — no license seam.

- **`holmes-guard`** — the compiled denylist: `policy` (provider/model tables, the single exempted home of excluded literals), L1b resolution guard (excluded **and unknown** ids denied), `spawn::sanitized_spawn` (L2: env-strip, absolute path, permitted injection), L1a deny-by-default egress proxy, AC-DL-2 scanner.
- **`holmes-core`** — the analytical surface per §6.2 as amended (A-07): `ResearchBrief` (with firewalled `stated_confidence`) in; `AnalyticalCase` (six-phase machine); **`EmittedEvidencePack`** out — the proof-of-gate wrapper only constructible through the emission gate. Safety exports Alfred will touch: `ApprovalProtocol`/`ToolGrant`/`ApprovalRequest` (2.5c), `SubjectScope`/`Consent`/`ConsentRecord` (2.5d), `Telemetry` (Phase 4: opt-in, born-redacted, content-free by construction, exported only at operator initiative — the library never phones home).

## 2 — Track 1: adopt the guard, retire the TypeScript one

1. Route all provider/model selection through **L1b**; the UI *reads* the permitted list from the crate — no policy logic remains in TS/JS anywhere.
2. Every goose spawn goes through **`sanitized_spawn`** (L2); Alfred-spawned goose/MCP sessions ride the **L1a** proxy.
3. **Delete `provider-lockdown.ts`** — delete, not deprecate: policy that ships as editable text is the disease being cured.
4. Alfred-side tests, release mode: excluded provider refused (including when an env var demands it); Anthropic/Google/DeepSeek/Qwen/Magistral/Gemma pass. Standalone security win for current users regardless of Holmes's timeline.

## 3 — Track 2: the artifact-level guard test — **the Holmes RC unblock (obligation 1)**

An Alfred CI job that (a) builds the **actual release artifact** (`tauri build`), then (b) executes against the **built product**: an environment demanding an excluded provider is refused; a planted config file is refused; a permitted provider works. Not a unit test of the crate — a test of what ships. **Definition of done:** the job green on Alfred `main`; the run URL recorded in Alfred's ledger and cross-linked into Holmes `STATE.md`. That single link flips Holmes RC from BLOCKED.

## 4 — Track 3: perimeter obligations 2–4, verified against the shipped artifact

- **(2) OS/artifact-level egress.** `holmes-guard` documents its honest residual: a hostile binary ignoring proxy env escapes the library boundary — enforcement at process/OS level is Alfred's. Verify what exists; where nothing does, ledger the gap honestly rather than declaring it closed.
- **(3) Signed updates with rollback.** Exercise the full cycle on real artifacts: install N → update to N+1 → **roll back to N**. The "beta.2 updater floor" claim is verified against the implementation, not the README. **No further Alfred release publishes before this is VERIFIED** — an unverified update channel converts one compromise into fleet-wide compromise (the CVE-2026-33634 lesson).
- **(4) Memory/resurfacing channel.** Verify born-redacted memory discipline against code; Holmes's Loop E rides this channel later and will not be granted a new one.

Each item closes VERIFIED-with-evidence (file/line or CI run) or becomes a ledgered Alfred work item. No silent middles.

## 5 — Track 4: embed the analytical surface (per D-14, Option A)

1. Flow: operator brief → `ResearchBrief` → `AnalyticalCase` → **render only `EmittedEvidencePack`** — never a raw pack; the wrapper's existence is the proof the emission gate ran.
2. **Render the honesty, don't truncate it:** knowability, the three-part limits statement, uncertainty statements, and `[eliminated]` hypothesis labels reach the screen. A pack stripped of its caveats in the UI is a caveat silently hardened.
3. **Approval UX (recorded Alfred obligation, 2.5c):** render `ApprovalRequest` previews; grants mint only from an explicit operator approval action. Deny-by-default is the crate's behavior — Alfred's job is to make the preview visible and the approval deliberate.
4. **Operator-attested types (2.5d):** `SubjectScope` and `ConsentRecord` are minted **only from operator UI actions** — never from case content, never pre-filled from fetched text. The consent seal exists precisely so content cannot launder authority; do not build a UI that launders it for the content.
5. **Reader process separation (recorded obligation):** when the live quarantined reader runs, it runs as a **separate no-tools process** under the L2 sanitized spawn — the in-process trust limit is documented in Holmes `docs/security.md`.
6. **Rider (a):** the `investigative` cargo feature stays **absent** from beta builds — do not enable it, do not build UI for it. **Rider (b):** beta copy states plainly that collection/investigative mode is not yet shipped, behind safety gates.

## 6 — What Alfred must never do (the boundary, compiler-backed where possible)

No reaching for quarantine internals (the raw-bytes accessor is `pub(crate)` and name-firewalled — F-034 closed that path; do not vendor or patch around it). No constructing safety tokens (`ToolGrant`, `ConsentRecord`, `TargetingAllowed`) outside their sealed mints. No rendering un-emitted packs. No blueprint types — none exist to import; Holmes emits evidence, never plans (triad invariant, enforced by Holmes's own structural tests).

## 7 — Sequence and definition of done

Track 1 → Track 2 (the RC unblock) → Track 3 in parallel, with **(3) gating Alfred's own next publish** → Track 4 against the pinned Holmes `main` (or the RC tag once cut). **Stage 1 is DONE when:** the four obligations each read VERIFIED with linked evidence in both repos' ledgers; the artifact-level test is a required check on Alfred `main`; `provider-lockdown.ts` no longer exists; and the beta copy carries rider (b)'s sentence.

**Honest limits, stated up front as always:** the guard governs Alfred's own sessions — a user's separately installed stock goose is theirs; AGPL forks can strip anything — governance, not the binary, answers for forks; and nothing in this brief claims otherwise, in release notes or anywhere else.

*Cross-references: Holmes `STATE.md` (RC gate, cross-repo obligations); `alfred-security-perimeter-overview.md` §§2, 6–7; `holmes-vs-wcjbt.md` §6.2 (as amended, A-07); Holmes `docs/security.md` (2.5 carried obligations); kickoff v3 §4.3 (guard design + honest limits); D-14 riders (a)–(c); F-034/F-036 (the sealed boundaries this brief instructs Alfred to respect).*
