# Study & Instrument pass — landing audit (W1)

**Date:** 2026-07-14. **Base:** main tip `70952f4` + W0 commits (`86fa709`, `907bef2`).
**Payload:** `study-instrument-pass.patch`, sha256 `be534178ff9f6829…` — transit hash matched the
manifest before anything was applied. 12 files, +736/−60, zero dependency changes (verified from
the patch bytes: no package.json / lockfile touched).

## Gates ruled by the builder (2026-07-14, words verbatim)

- **Gate (a) — ADR-0005 attribution:** "RATIFIED — the seven fields, bands, and two-layer rule
  stand as canonized. Accepted status stays; set the attribution date to the date I'm giving this
  word if the doc's date doesn't match reality." The draft carried "Accepted (Martin, 2026-07-13)"
  while the design log said acceptance was pending → the doc now states Accepted 2026-07-14 with
  the draft date disclosed. A decision doc may not claim an acceptance that wasn't given.
- **Gate (b) — LOOP-DESIGN.md:** "COMMIT — session record, house precedent (LOOP.md itself)."

## G1 — replicated in this container (EXECUTED, post-apply)

| Gate | Result |
|---|---|
| Pre-apply baseline | 25 passed \| 3 skipped files; **254 \| 4 tests** (captured fresh, same turn) |
| `git apply --check` | clean against the live base (six src files survived Stage-D's 16 commits) |
| typecheck + typecheck:mcp | both exit 0 |
| vitest post-apply | 26 \| 3 files; **265 \| 4 tests — exactly +1 file / +11 tests, skips unchanged** |
| contrast gate | `node scripts/check-contrast.mjs` → all pairs ≥ WCAG-AA, final pair 9.48:1 |
| build / build:web | ✓ 18.42s / ✓ 15.62s, precache 28 entries (matches design-session count) |

Commit split honored: `271cbbc` (Pass 1: tokens + evidence primitives + ActionPreview restyle +
contrast gate, styles.css appended-section hunk only), `90cc7da` (Pass 2: brass swap + badge
mount + violet→token sweep), `008a14b` (ADR-0005 per gate (a) + LOOP-DESIGN per gate (b)).
Post-split integrity check: final styles.css diffed byte-identical to the full-patch target.

## G2 — routed to the Windows leg (UNVERIFIED here — environment)

This container has no cargo-buildable GTK stack, no staged sidecar binary for journeys, and no
browser. Each line below stays open until the laptop (pulled to tip) reports:

1. `cargo test` — closes the standing 9/9 honest-partial (Job Object test is Windows-only).
2. `npm run check:exclusion*` — sibling WCJBT present there.
3. `npm run verify:all` end-to-end — the live-goose trio must EXECUTE, zero skips.
4. Tauri desktop boot.
5. Visual journeys 1 / 4 / 5 / 6 / 7 — console-clean, both themes, reduced-motion, mobile width;
   EvidenceBadge all six states + unmarked-renders-nothing; ActionPreview with/without
   `reversibility`.
6. Copy audit on touched surfaces.

## Known findings carried forward (flagged, deliberately not fixed here)

- Graph does not retint on live accent change until remount (pre-existing class of limitation).
- Dark-theme selection auto-resets accent to default (inherited behavior, kept).
Both are known-issues candidates for the W8 beta docs.
