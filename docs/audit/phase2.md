# Phase 2 audit — the agentic vault scaffold (the differentiator)

**Date:** 2026-06-25
**Build target:** native Windows 11
**Goal:** an opt-in, one-click "Agentic Project" vault that operationalizes
`docs/research/agentic-pkm-architecture.md` — deterministic topology, the hot.md
anchor, load-bearing frontmatter, tiered memory, Spec Kit flow, and a
Proposal-First Librarian.

Operationalized (not restated): each idea below is working, tested code.

---

## Architecture

Pure, dependency-free, unit-tested logic lives in `src/lib/agentic/` (no
`@platform`/DOM, so it runs in the Vitest node env). The single `@platform`
layer is `vault.ts`, which composes the pure modules with the vault filesystem.

| Module | Operationalizes | Tested by |
|---|---|---|
| `topology.ts` | ASB deterministic topology + born-compliant constitution | `topology.test.ts` |
| `hot.ts` | the hot.md progressive-disclosure anchor (generate ⇄ parse) | `hot.test.ts` |
| `frontmatter-schema.ts` | load-bearing frontmatter schema + validator + `lintNote` | `frontmatter-schema.test.ts` |
| `memory.ts` | Hermes tiered memory (hot buffer → promote at threshold) | `memory.test.ts` |
| `librarian.ts` | Proposal-First Librarian (structural, not advisory) | `librarian.test.ts` |
| `spec-kit.ts` | constitution → specify → plan → tasks → implement | `spec-kit.test.ts` |
| `vault.ts` | platform wiring (scaffold, refresh, audit, spec feature) | (integration; via App) |

**Tests: 79 passing** (75 + 4 `lintNote`), incl. the three required suites
(frontmatter validator, hot.md generator, Librarian proposal-only).

---

## 1. Topology (deterministic) — `buildScaffoldPlan`

One-click scaffold writes **22 entries (8 folders + 14 seed files)**, non-clobbering:

```
brain/            NORTH_STAR.md  RULES.md  constitution.md
specs/            README.md
memory-bank/      projectbrief.md techContext.md activeContext.md progress.md
memory-bank/decisions/  0000-template.md (ADR)
domains/  inbox/  daily/  thinking/   (each with a README)
hot.md            (vault root)
```

Every seed file carries valid load-bearing frontmatter (verified in
`topology.test.ts`). The **constitution inherits the platform exclusion policy**
(Meta/OpenAI/xAI excluded, React forbidden, zero-Soapbox, AGPL) so any project
scaffolded inside is **born compliant**. Wired as the **Scaffold Agentic Project**
command palette entry.

## 2. hot.md anchor — `generateHotMd` / `parseHotMd`

~500-word current-state snapshot at the vault root, written almost entirely as
`[[wikilinks]]` (sections: Current focus / Recent decisions / Open loops /
Prerequisites / Anchors), with valid frontmatter and a token-budget guardrail
(`HOT_TOKENS_MAX = 4000`). `generate` and `parse` are **inverse**, so it
round-trips and refreshes idempotently (tested).

- **Generate/refresh command:** "Refresh hot.md".
- **Session-end hook:** a `visibilitychange → hidden` listener refreshes hot.md
  on hide/close (the Stop-hook analog), with `createIfMissing:false` so it never
  seeds hot.md into a non-agentic vault.

## 3. Load-bearing frontmatter — schema + validators

Schema = `id`, `description` (≤ 150 chars), `tags`, `domain`, `updated` (ISO date).
- `validateFrontmatterObject` / `validateNoteContent`: accept valid, **reject
  malformed** (missing/over-long description, non-list tags, bad date, missing id).
- `lintNote` (PostToolUse-style): wired into `saveTab` — always checks wikilink
  syntax; validates the schema only when frontmatter is present (plain notes are
  not forced). Warns, never blocks.
- **Properties panel extended:** shows load-bearing status + issues and a
  "Complete load-bearing fields" one-click action.
- `frontmatter.ts` is composed/extended (the schema module builds on its
  parse/serialize).

## 4. Tiered memory discipline — `memory.ts`

Hot buffer limit 6,000 chars; promote at ~67% (`PROMOTION_THRESHOLD`). `classifyMemory`
routes **decisions → memory-bank/decisions, preferences → memory-bank/preferences.md,
failed-approaches → memory-bank/progress.md**; **chatter is discarded** (never
promoted). `daily/` is the permanent chronological tier. Tested end to end.

## 5. Spec Kit flow — `spec-kit.ts`

`/speckit.constitution → specify → plan → tasks → implement`. `buildSpecKitFeature`
lands `specs/<feature>/{spec,plan,tasks}.md`; specs inherit `[[brain/constitution]]`
(born compliant). Wired as the "Spec Kit: New Feature" command.

## 6. AI Librarian — Proposal-First (hard rule)

`auditVault` is **pure and read-only** — it returns proposals (broken/malformed
links, orphans, invalid frontmatter, evergreen-extraction suggestions) and
**never mutates its inputs** (asserted by test). The only mutator,
`applyApprovedProposal`, **throws `LibrarianWriteRefused` unless `{ approved: true }`**
is passed — so an unprompted call cannot change a note. Wired as "Run AI Librarian
(proposal-only)"; results are surfaced to the console + a notification — **nothing
is written**.

---

## Verification

- `npm run verify:all` — **green**: `tsc --noEmit`, **79 Vitest tests**, L1+L2
  exclusion gate (clean), L3 advisory, `build` (Tauri frontend) + `build:web` (PWA).
- One-click scaffold renders the full topology (demo: 22 entries).
- hot.md round-trips and refreshes idempotently.
- Frontmatter validation accepts valid input and rejects every malformed case tested.
- Librarian audit never writes; the write path is refused without explicit approval.
- Spec Kit artifacts land under `specs/<feature>/`.

## Notes / scope boundaries

- The Librarian's proposals surface via console + notification (read-only). A
  richer in-app proposals panel (review/approve UI) is a later UI refinement; the
  proposal-only guarantee is already enforced and tested at the logic layer.
- No new runtime dependencies were added (the frontmatter validator is
  hand-rolled, composing the existing `frontmatter.ts`).

**Stop for review before any push.**
