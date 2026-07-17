# Fix-wave proposal — W1 journey bugs (PLAN ONLY; no code in this document's commit)

**Date:** 2026-07-14. **Status:** **ACCEPTED — RULING B (builder, 2026-07-14, ship-first):**
fix wave = **#1 + #3 as drafted**; badge protocol SUSPENDED; **#2 parked
[UNVERIFIED — deferred to open beta]** and documented in the beta known-issues doc (W8) — the
verdict table below stands, beta reports are the instrument; if the #3 fix incidentally makes
the badge render, log it, don't chase it. Ledger rationale (builder's words): "beta testers
should focus on visible bugs and task-level QA; the shipped beta must be stable and clean in
the core note loop."
**Inputs:** the Windows-leg journey walk (builder, 2026-07-14) + source reads in the container at
`2f72db1`. Every claim below is labeled: CONFIRMED-IN-SOURCE (file:line read) or HYPOTHESIS
(instrument before any fix — per the builder's standing order).

---

## Bug #1 — P1: vault-create silent failure (J1)

**Observed:** first-run vault creation fails with nothing shown to the builder.

**What the source says (CONFIRMED):** the onboarding UI *has* an error surface —
`vaultError` signal, set in the catch (`Onboarding.tsx:127-129`), rendered at `:279-286`. So the
silence is NOT "no error handling"; the failure either (a) doesn't throw, (b) throws somewhere
the banner doesn't cover, or (c) happens downstream of a "successful" onboarding.

**Failure-path candidates (each checkable by the instrument):**
1. `create_folder` (Rust, `lib.rs:382-387`) runs `validate_vault_path(&path, &vault)` with
   path == vault on a directory that does not exist yet — canonicalization of a not-yet-existing
   path is a classic silent-shape failure; its error string may be generic or swallowed upstream.
2. The banner renders on a step other than the one the builder is looking at, or out of
   viewport — error set, never seen.
3. No exception at all: `createFolder` + `settings.save` succeed, `goNext()` advances, but the
   post-onboarding vault open (`set_vault_scope`, `lib.rs:394-399`, which REJECTS non-existent
   paths) fails later — the app just looks empty. Silent by architecture, not by a bug in the
   catch.

**Plan (failure surface first, per the builder's order — the fix is not just "make it work"):**
- **Instrument:** dev-only structured log at the four await points of `createNewVault`
  (path determination / `createFolder` / `settings.save` / `goNext`) + at `set_vault_scope`
  rejection, each logging outcome + error string. One laptop repro names the failing point.
- **Fix shape (post-verdict):**
  1. Every failure reason becomes a plain-language banner ON the step where the click happened,
     carrying the underlying OS error string — never a bare "failed".
  2. The downstream case gets its own surface: if the vault cannot be opened after onboarding,
     the main window shows "Your vault could not be opened: <reason> — <path>" with a retry and
     a choose-different-folder action, instead of an empty shell.
  3. Unit test for the pure path-determination branch; failure-injection walk on the laptop for
     the Tauri side; J1 re-walk closes it.

## Bug #3 — P2: non-idempotent scaffold prepend above the frontmatter fence (with the stacking mechanism found)

**CONFIRMED-IN-SOURCE — the stacking mechanism:**
- `parseFrontmatter` requires the opening `---` at **line 0 exactly** (`frontmatter.ts:53-56`).
  Anything above the fence ⇒ parse returns null.
- `PropertiesPanel.applyChanges`, on null parse, **prepends a brand-new frontmatter block above
  the entire content** (`PropertiesPanel.tsx:157-163`). A note contaminated once therefore gains
  a SECOND fence block on the next property edit, and another on the next — non-idempotent by
  construction. This is also the **#2 contamination path**: `EvidenceBadge` reads the same parse
  (`PropertiesPanel.tsx:216` → `propertiesToObject(properties())`), so a contaminated note shows
  no badge even when evidence fields exist below the displaced fence.

**PRIME SUSPECT PINNED BY FIELD EVIDENCE (2026-07-14, builder's byte capture):** the laptop's
`badge test.md` opens with bytes `42,42,42` = `***` (not `---`), contains TWO frontmatter-shaped
blocks each opened by `***`, each carrying a DIFFERENT auto-minted stable id (`a-mrkis6ei…`,
`a-mrkis4qo…`), the first closed by an 18-dash line. Mechanism this evidences:
1. `---` is also markdown's thematic-break syntax; when not consumed as frontmatter, the
   editor's markdown round-trip re-serializes the fence as `***` (serializer's preferred
   thematic-break marker) and re-emits under-text dashes at heading-underline length (the
   18-dash line).
2. Once the fence reads `***`, `parseFrontmatter` nulls forever.
3. Each Properties-panel apply on a null parse prepends a fresh block and mints a fresh id —
   the two distinct ids in the file are one fossil per prepend cycle.
The instrument below still runs to CONFIRM (trace must show an editor-sourced write flipping
fence-at-0 to false / mutating fence bytes); but the candidate list collapses to
editor-round-trip-first. Original candidates (template heading order, insert-at-cursor) stay
listed only as fallbacks if the trace exonerates the round-trip.

**Plan:**
- **Instrument** (shared with the race below): tag every content write with a
  fence-at-line-0 boolean; the first write that flips it to false names the culprit.
- **Fix shape (post-verdict):**
  1. Harden `applyChanges`: when parse fails BUT a fence exists later in the note, never prepend
     a second block — surface it ("frontmatter is not at the top of this note") with a
     one-click deterministic relocate. Surface-first, auto-fix only on the builder's click
     (builder-agency: the panel must not silently restructure a note).
  2. Idempotence guard at the culprit writer once named.
  3. Regression tests: null-parse-with-late-fence never yields two fences; scaffold applied
     twice equals scaffold applied once; badge renders on a note whose fence is at line 0 with
     evidence fields.

**Acceptance criteria (RULING B — binding; no green without a demonstrated red first):**
- (a) the fence **survives the editor round-trip** — a test that FAILS on today's serializer
  behavior (`---` → `***`) before the fix, passes after;
- (b) **"Complete load-bearing fields" is idempotent** — two presses, one scaffold; the test
  must reproduce today's two-block stacking (red) before the guard lands (green);
- (c) the **clean badge fixture parses end-to-end** (`parseFrontmatter` → `propertiesToObject`
  → `parseEvidence` on a fence-at-line-0 note with `confidence: 0.9`) — encoded as a unit test.

## Bug #2 — conditional slot (still open: first clean test was invalidated)

The first clean-test file turned out to be contaminated itself (bytes `42,42,42` — see #3 field
evidence), so its badge-absence discriminates nothing. Re-test protocol issued: create the note
OUTSIDE the editor (`Set-Content -Encoding Ascii`, fence verified `45,45,45`), open in Alfred,
observe the Properties panel WITHOUT editing. **Badge present** ⇒ #2 withdrawn (contamination
explains the original sighting). **Badge absent on the verified-clean file** ⇒ #2 real: log
`propertiesToObject(properties())` at badge mount — the parse chain (`parseFrontmatter` →
`propertiesToObject` → `parseEvidence`) has three hand-offs and the log names the broken one.
Bonus data point either way: re-run the byte check after merely OPENING the file — mutation
without an edit would be the round-trip instrument's first capture for free.

## Flash-then-revert write-race — stays [HYPOTHESIS]; instrument designed, no fix planned

**Mechanism candidates (CONFIRMED as architecture, not yet as the fault):** the app has THREE
content writers with two sources of truth —
1. the Milkdown editor's internal buffer (its onChange → tab content),
2. `PropertiesPanel.onUpdateContent` → direct tab-content replacement + 2s autosave
   (`App.tsx:2975-2984`),
3. the file-watcher reload, which cancels pending autosave and overwrites tab content whenever
   disk differs from the tab (`App.tsx:508-541`).

Plausible race: properties edit updates the tab, but the editor still holds the pre-edit buffer;
any subsequent editor onChange re-asserts the stale buffer — flash (property applied), revert
(stale buffer wins). Alternative: autosave's own write triggers the watcher, which reads disk and
clobbers a newer unsaved edit.

**Instrument (dev-only, zero behavior change):** a ring-buffer trace tagging every tab-content
write with {source: editor|properties|watcher|save, path, content-hash, fence-at-0, timestamp}.
Reproduce the flash on the laptop; the trace names the reverting writer.
**Kill criteria:** if no stale-buffer write appears in the trace during a repro, the hypothesis
dies and the watcher-reload path is re-examined with the same trace. No fix is written until one
of those two verdicts is on record.

## Sequencing (RULING B; Rule 9 per commit)

1. **#3 first where the mechanism is already proven** — the serializer fence-mutation and the
   null-parse prepend are CONFIRMED (source + field bytes); their red-first regression tests can
   be written immediately, no instrument gate needed for those two fixes.
2. **#1 instrument commit** (dev-only logging at the four `createNewVault` await points +
   `set_vault_scope` rejection) — one laptop repro names the failing point, then the
   failure-surface fix lands. #1 stays ship-blocking.
3. The **write-race trace** ships inside the same instrument commit but its fix (if any) is not
   part of this wave unless the trace convicts a writer that #3's guards don't already cover.
4. G1 re-run + re-walk of J1 and the note/properties loop only. #2 is OUT of the wave (parked to
   beta known-issues); badge observations from beta testers are the instrument of record.
