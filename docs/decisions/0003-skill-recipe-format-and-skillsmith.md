# 0003 — Skill/recipe format handling and the Skillsmith dependency (three locks)

**Status:** Accepted (2026-07-12); **Implemented (Stage C, 2026-07-13).** Builder verdict: build
the three locks. All three are landed and proven by executed tests with planted-failure canaries
(`src/lib/skills/skill-scan.ts` + `skill-registry.ts`, `src/components/SkillConsent.tsx`).
Skillsmith auto-install wiring remains OUT until a skill-install path is built and the builder
separately says the word — the locks are the gate that path must pass.
**Decider:** builder (Martin Montero).
**Phase:** drafted in the open-beta loop, Stage A. No lock code lands until Accepted.

## Context

Alfred's agentic surface executes two kinds of third-party instruction files:
- **goose recipes** (YAML) — already guarded: sanitize-before-parse, AST action enumeration,
  pre-flight ActionPreview, clean-tree staging (`src/lib/goose/recipe-scan.ts`, Phase 5 Step 1).
- **SKILL.md skills** — the planned channel. Upstream onyx's skill fetch was severed in Phase 1
  (decision 0001: rebuild Alfred-native, never vendor). Skillsmith is the candidate registry/
  tooling, consumed **external-npx-only, never vendored** (settled: ELv2 boundary,
  connect-over-process).

Live state (VERIFIED 2026-07-12, npm + github.com/smith-horn/skillsmith):
- `@skillsmith/core` **0.11.1**, `@skillsmith/mcp-server` **0.7.2** — both Elastic-2.0. (Both
  previously REPORTED values were stale; npm is the authority.)
- Skillsmith's SECURITY.md scanner claims cover **zero-width obfuscation only**. **No coverage of
  the Unicode Tags block (U+E0000–U+E007F), variation selectors, or bidi controls.** Alfred's own
  sanitizer already covers all of these for recipes. The gap is real and current; if Skillsmith
  ships Tags-block coverage later, that lowers lock-1 urgency but does not remove it (defense in
  depth at Alfred's own chokepoint remains the settled posture).

## Decision proposed

1. **Format:** SKILL.md files are handled exactly like recipes: sanitized before parse with
   Alfred's own `invisible-chars` sanitizer; never executed or handed to goose from an unscanned
   path (clean-tree staging, as recipes do today).
2. **Skillsmith stays external:** invoked via `npx` at arm's length; never a package.json
   dependency; never bundled; its output treated as untrusted input to Alfred's own locks.
3. **The three locks are a precondition for ANY skill installation path:**
   - **Lock 1 — scan like recipes:** extend the scanner to SKILL.md — Tags block, zero-width set
     (U+200B–U+200F, U+FEFF), bidi controls, variation selectors, decode-before-match
     (base64/hex payloads); scan at install time AND at session start (rug-pull defense: a file
     mutated after install is re-caught).
   - **Lock 2 — install-time consent:** an ActionPreview-class event; the rendered + sanitized
     SKILL.md shown with stripped invisibles surfaced; Skillsmith trust tier + scan result
     displayed; explicit approval; never silent.
   - **Lock 3 — active-skill visibility:** what is active, with diff since last session;
     out-of-band edits flagged.
4. **Skillsmith auto-install wiring stays OUT** until all three locks are green by executed test
   (including planted-payload canaries) and Martin says the word.

## Honesty boundary

Signature/character scanning **cannot catch semantic injection** — a skill written in plain,
visible language that instructs an agent to do harm passes every lock. The locks are necessary
(they close the invisible/obfuscated channel and the silent-install channel), **not sufficient**.
The residual control is consent (lock 2), visibility (lock 3), and the tool-permission gate on
what any instruction can actually execute.

## Alternative if Rejected/deferred

The open beta cannot ship with the skills channel unguarded. If this ADR is not Accepted before
Stage C, the beta ships with the channel **proven closed**: an activation probe demonstrating no
SKILL.md ingestion path exists on Alfred's real launch path, pinned by a test, with the accepted
risk recorded here. Either locks or proven-closed — never neither.
