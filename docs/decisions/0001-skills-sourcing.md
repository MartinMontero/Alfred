# 0001 — Skills sourcing: rebuild Alfred-native, drop the upstream dependency

**Status:** accepted (2026-06-25)
**Decider:** builder (Martin Montero)
**Phase:** decided in Phase 0; executed across Phase 1 (removal) and a later goose phase (rebuild).

## Context

The Onyx base ships a "skills" system with two runtime sources:

1. **`derekross/onyx-skills`** — fetched at runtime (onboarding + Settings) as `manifest.json`
   + raw `SKILL.md` files from `raw.githubusercontent.com`, saved to `~/.config/opencode/skills/`.
2. **`skills.sh`** ecosystem (`src/lib/skills.ts`) — fetches arbitrary third-party GitHub
   repos' `SKILL.md` files.

Investigation of `derekross/onyx-skills` (read-only, 2026-06-25; nothing cloned/copied):

- **7 skills**, ~76 KB, 17 markdown files: `executive-assistant`, `planning-with-files`,
  `strategic-planning`, `content-research-writer`, `docx`, `pptx`, `xlsx`. Generic
  productivity/document skills; none PKM/vault/Alfred-specific.
- **License:** no `LICENSE` file; README states "MIT License" in prose only (no copyright
  line). MIT-by-declaration, weak hygiene — same pattern as Onyx itself.
- **Exclusion/Soapbox scan (all 17 files):** no OpenAI/xAI/Soapbox provenance. Only
  prose "Meta" hits — two false positives ("meta tag") and one footnote that
  `planning-with-files` borrows methodology from **Manus** (acquired by Meta) — a
  values note, not a code dependency.
- **External calls:** only doc links + illustrative example shell commands; no live API
  calls baked in.
- **Coupling:** the manifest is "AI productivity skills for **OpenCode**"; skills install
  to `~/.config/opencode/skills/`. The whole system is wired to OpenCode — the harness
  Alfred removes in Phase 1.

## Decision

**Rebuild Alfred-native skills from scratch. Do not vendor `onyx-skills`, and drop the
upstream runtime dependency.**

- **Phase 1:** remove the `onyx-skills` *and* `skills.sh` runtime fetch as part of the
  OpenCode removal (the skills system is OpenCode-coupled). The `onyx-skills` URL
  references are deleted then, not rewritten in Phase 0 (rewriting to a non-existent
  `alfred-skills` URL would break the feature and fabricate a path).
- **Later (goose phase, ~Phase 4–5):** author a small set of Alfred-native, **AGPL**
  skills/recipes aligned to the agentic vault + goose. Prefer **goose recipes** (the
  platform already ships `goose-recipes/`) as the primary workflow-packaging mechanism.
  Ideas may be borrowed (e.g. planning-with-files, executive-assistant); upstream content
  is not copied.

## Rationale

- **Sovereignty:** eliminates live runtime fetches of *executable agent instructions*
  from an unlicensed-by-file, third-party repo (and the broader `skills.sh` arbitrary-repo
  surface) — exactly the external dependence Alfred's ethos resists, and a Phase-5
  agent-safety concern.
- **Fit:** generic docx/pptx/planning skills don't leverage Alfred's vault/MCP/goose.
- **Cleanliness:** avoids importing and maintaining OpenCode-era content tied to a removed
  harness; keeps the licensing surface AGPL-clean.

## Consequences

- No `onyx-skills` content enters the Alfred tree.
- The skills UI/feature is removed in Phase 1 and reintroduced natively later; until then,
  Alfred has no in-app skill catalog.
- A future decision record will define the Alfred-native skill/recipe format and source.
