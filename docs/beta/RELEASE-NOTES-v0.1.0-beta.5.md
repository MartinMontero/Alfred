# Release notes — v0.1.0-beta.5 (DRAFT for Martin's review)

**Target path in repo:** `docs/beta/RELEASE-NOTES-v0.1.0-beta.5.md`
**Tag:** `v0.1.0-beta.5` · **Numeric version:** `0.1.4` · **Cut from:** `main` (`77c2cfb` or later)

> Draft authored 2026-09-01 in the BuilderOS project. Every claim below is labeled. Martin reviews
> before the tag is cut (Rule 9).

---

## What beta.5 is

A re-cut of the beta line from current `main`. **beta.4 was never published and never will be** —
its tag pointed at a tree that predated two load-bearing changes, and publishing it would have
shipped the wrong goose. beta.5 is the first publishable tag that contains what it claims to ship
(system invariant 10).

## What changed since beta.3 (the last published build)

1. **goose sidecar: 1.41.0 → 1.43.0** (VERIFIED-LIVE 2026-09-01: `EXPECTED_GOOSE_VERSION = '1.43.0'`
   in `scripts/stage-goose-sidecar.mjs` on `main`). The Holmes guard was verified against goose
   1.43.0 (CANON: Holmes STATE.md); beta.4's tag still pinned 1.41.0 — that version skew is the
   reason this re-cut exists.
2. **Desktop-only, settled** (CANON: ADR-0010). There is no user-facing web build. The
   `BUILD_TARGET=web` build exists only as an internal CI harness and is guarded by
   `src/lib/no-web-ship.test.ts`.
3. [Martin: add anything else user-visible that landed on `main` between beta.3 (`8a55c9c`) and
   the cut point — run `git log 8a55c9c..main --oneline` and pick the tester-relevant lines. Do not
   copy commit messages verbatim; write what a tester notices.]

## Version bookkeeping (for the record)

- Tag ↔ numeric map continues: beta.2 ↔ 0.1.1, beta.3 ↔ 0.1.2, beta.4 ↔ 0.1.3 (never published),
  **beta.5 ↔ 0.1.4**.
- The updater orders on the **numeric** version (CANON: ADR-0009). `0.1.3` is spent on the stale
  tag; that is why this release is `0.1.4`, not a re-tagged `0.1.3`.
- `latest.json` is authored by the release lane, three keys (NSIS, MSI, fallback), and the lane
  hard-fails unless every key points at this tag's artifacts with matching signatures. Never
  hand-edit `latest.json` — re-run the lane.

## Before this tag is pushed (gate checklist)

- [ ] `docs/beta/rollback-checklist.md` dry run (journey J6) executed and recorded below.
- [ ] Forward live-update walk beta.3 → beta.5 executed from an installed build.
- [ ] Live-goose trio executed on Windows against staged goose **1.43.0** (permission-startup,
      acp-handshake, recipes.live) — the 1.43.0 bump has not yet been through these (UNVERIFIED as
      of 2026-09-01).
- [ ] CI green on the cut commit, including `artifact-guard`.
- [ ] `artifact-guard` is a required status check on `main` (Stage 0.3).

## Rollback exercise record

| Walk | Date | Result | Evidence |
|---|---|---|---|
| J6 dry run (local `latest.json`) | | | |
| Forward beta.3 → beta.5 live update | | | |
