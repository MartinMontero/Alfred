<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# Vault schema versioning

**DRAFT — for human review (2026-09-07). Not yet adopted.**

This document has two halves. **Current state** records only what is verified in the code and
docs today. **Proposed convention** is a schema-governance proposal that requires Martin's
sign-off before anything is built — per the constitution (rule 5), schema changes are a
stop-and-ask; nothing in the second half is authorized by this document.

---

## CURRENT STATE (verified)

### What the vault writes today

The vault is a folder of plain Markdown files. Structured metadata lives in YAML frontmatter —
the `---`-delimited block at the top of a note.

**The generic frontmatter layer** (`src/lib/frontmatter.ts`, Phase 1 lineage):

- Parses and serializes `key: value` frontmatter with typed values (text, list, boolean,
  number, ISO-date strings) via `parseFrontmatter` / `serializeFrontmatter`.
- Property edits go through `setProperty` / `updateFrontmatter` /
  `applyPropertiesToContent` — the Properties panel's path. `applyPropertiesToContent` refuses
  to prepend a new block when a *displaced* frontmatter block exists below line 0 (the W1 bug
  #3 fix: duplicate-fence stacking is flagged, never silently re-created).
- The editor never sees frontmatter at all: `splitFrontmatter` / `joinFrontmatter` hold the
  frontmatter block aside (byte-exact join) so the Markdown serializer cannot rewrite the
  fence. Displaced blocks surface a warning in the UI rather than being auto-repaired
  (`docs/beta/known-issues.md`, issue 2 — corruption fixed in `57f4ca7`; pre-existing corrupted
  notes are flagged, not rewritten).

**The agentic (load-bearing) schema** (`src/lib/agentic/frontmatter-schema.ts`, Phase 2 — see
`docs/audit/phase2.md` §3):

- Exactly five required fields, in canonical order: **`id`** (stable, rename-surviving, never
  reused), **`description`** (one line, ≤ 150 chars, warned under 12), **`tags`** (list),
  **`domain`** (owning silo), **`updated`** (ISO `YYYY-MM-DD`).
- Validation (`validateFrontmatterObject` / `validateNoteContent`) applies only *when
  frontmatter is present* — plain notes without frontmatter are valid and untouched. Unknown
  extra properties are preserved, not stripped.
- This schema applies to agentic-project vault notes (seed files, `hot.md`, memory-bank
  entries); it is a convention enforced by validators and linters, not a file format change —
  the files remain ordinary Markdown.

### What is NOT versioned today

- **There is no `schema_version` field anywhere.** A repository-wide search for
  `schema_version` / `schemaVersion` across `src/` and `src-tauri/src/` returns nothing
  (verified 2026-09-07). Neither individual notes nor the vault as a whole carry a version
  marker.
- **There is no migration machinery.** Nothing in the tree reads a version, upgrades a note, or
  rewrites frontmatter in bulk. The only "repair" behavior that exists is the displaced-fence
  *warning* above, which is deliberately non-destructive.
- Note the honest mismatch this creates: `docs/release-process.md` (§Rollback → Data) says
  "vault schema is versioned (G5)" — that statement describes the **plan** (item G5 of the
  beta-readiness work), not a shipped mechanism. As of this draft the promise stands on the
  *rule* below, not on code.

### The standing rule (already in force)

From `docs/beta/rollback-checklist.md` (§What a rollback is NOT) and `docs/release-process.md`
(§Rollback → Data):

> Vault schema changes ship with a down-migration note in `docs/` **before** the release that
> introduces them. **No migration, no schema change.**

This rule is binding today. It means any change to what Alfred writes into notes (new required
frontmatter fields, renamed fields, changed types, a vault-level marker file) must be preceded
by a written note describing how to go back — otherwise the change does not ship. Since no
version marker exists yet, "schema change" currently means: any change to the five-field
load-bearing schema, to the frontmatter writer's output shape, or to any vault-level file
Alfred creates.

---

## PROPOSED CONVENTION (needs Martin's sign-off — constitution rule 5)

The proposal below is the minimum that makes the standing rule mechanically enforceable. It is
written as a decision to be taken, not a design in progress.

### P1 — Where the version lives

Proposal: a **vault-level integer**, not a per-note field.

- Location: a small marker file at the vault root, `.alfred-vault.json`, carrying
  `{ "schema_version": 1 }` (and nothing else to start). Rationale: schema here means "what
  Alfred's writers emit and readers expect," which is a property of the vault, not of any one
  note; a per-note field invites per-note drift and makes every migration a bulk rewrite of the
  user's files (a destructive-action class we avoid by default).
- Absent file = version 0 = "pre-versioning vault," which is every vault that exists today.
  Version 0 vaults are read exactly as now; the marker is written only when the vault first
  opts into (or is created under) a versioned writer.
- Alternative considered and not proposed: a `schema_version` key in each note's frontmatter.
  Rejected for the bulk-rewrite reason above and because plain (non-agentic) notes must stay
  valid with no frontmatter at all. [VERIFY] with Martin before adopting — the alternative is
  recorded here so the decision is explicit.

### P2 — What the version governs

- The load-bearing frontmatter schema (the five required fields and their types).
- The set of vault-level files Alfred creates and their shapes (today: `hot.md`, the memory
  bank layout — see `docs/audit/phase2.md`).
- Explicitly out of scope: the `.md` files' body content (always plain Markdown), and the Nostr
  event kinds (30800/30801/30802 payloads are the sync layer; changing those is a separate
  sign-off under the "no new Nostr event kinds" constitution rule).

### P3 — Migration-note-per-release requirement (mechanizing the standing rule)

- Every pull request that would bump `schema_version` must include
  `docs/migrations/NNN-to-NNN+1.md` containing: what changes in writers/readers, the automatic
  upgrade path (if any), and the **down-migration note** — how a user on the new schema returns
  to the previous release without data loss, consistent with the rollback rule (a rollback is a
  higher-numbered release carrying older code; the down-note is what makes the *data* side of
  that safe).
- The release notes of any tag whose build writes a new schema version must link that migration
  document. The release gate (manual checklist, `docs/release-process.md`) gains one line:
  "schema version bump ⇒ migration doc present." No migration doc, no tag.

### P4 — Beta-tester compatibility promise

- Alfred **reads every older schema version forever** (reading is never gated on upgrading).
- Upgrades happen only on explicit user action (a prompted, explained one-click upgrade), never
  silently on app start — vault writes are the user's data, and silent rewrites violate the
  no-silent-moves rule.
- Within the beta line, a downgrade of the app onto a newer-schema vault never corrupts data:
  worst case, the older build treats unknown fields as inert extras (the current
  preserve-unknown-properties behavior already does this) and the migration doc covers anything
  beyond that.
- Testers are told in release notes whenever a release contains a schema bump, in plain
  language, with the down-migration link.

### P5 — Open questions for the sign-off

- Should version 0 vaults ever be auto-marked (writing `.alfred-vault.json` on next open), or
  only on first agentic-vault action? Auto-marking is a vault write without a user gesture —
  leaning "only on action."
- Does the sync layer (kind 30801 vault index) need to carry the schema version so a second
  machine on an older Alfred can warn before writing? [VERIFY] against the 30801 payload shape
  in `src/lib/nostr/sync.ts` before deciding.
