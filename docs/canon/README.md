# docs/canon — governing canon, home in the repo

**Precedence (per the BuilderOS spec, as stated in Martin's canon-homecoming
tasking 2026-09-07 — the BuilderOS spec text itself is not on this disk;
label: REPORTED):** **verified primary source > component canon > system
spec.** Within its lane, this repo's own canon governs.

## Governing canon — in-repo

`CLAUDE.md` (standing orders + constitution), `SECURITY.md`, `LOOP.md`,
`LOOP-DESIGN.md`, `LOOP-INTEGRATION.md`, `builder-os-console-spec.md`,
`docs/decisions/*` (ADRs 0001+), `docs/triad-canon.md` (**mirror** —
canonical home: the WCJBT repo, `docs/canon/triad-canon.md`; WCJBT copy
wins on disagreement), `docs/epistemology/claude-code-epistemic-integration-prompt.md`,
`docs/beta/rollback-checklist.md`, `docs/release-process.md`.

## ABSENT (checked, not assumed — 2026-09-07; carried from the W2 landing audit)

- **`epistemic-canon-Alfred.md`** — unrecovered on every surface checked
  (W2 audit open item #1, 2026-07-14). Deliberately NOT re-derived.
  Resolution is Martin's: recover the original (created 2026-06-30,
  Kimi-project-side) or commission a derivation from
  `epistemic-canon-Holmes.md` + `triad-canon.md` as its own approved task.
- **The `00-PROJECT-INSTRUCTIONS` set** named in the homecoming tasking —
  not on this disk (a same-named file exists only in the unrelated
  Founders Quest project). If it lives in the Kimi project, export it and
  it lands here.

## Reference material (stays put; not governing)

`docs/research/*`, `docs/audit/*`, `docs/epistemology/wisdom-*.md` (the
Map), `_alfred-inbox/*` (untracked inbox).

## The vocabulary

Alfred's own ADR-0005 defines the five build-workflow states this
homecoming standardizes on: EXECUTED / VERIFIED-LIVE / CANON / REPORTED /
UNVERIFIED (loop reports and audits only, never product UI — the
two-layer rule stands). Holmes's D-15 (Martin, 2026-09-01) retires
`[DIRECTIONAL]`/`[NEEDS-CAVEAT]` Holmes-side onto these states; the
triad-canon mirror's "Honest epistemics" line is migrated identically in
all three repos (this PR).
