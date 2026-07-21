# 0007 — The interactive icon contract (and no cloud imagery for relay sync)

- Status: Proposed
- Date: 2026-07-20
- References: Pass-1 design brief ("The Study & The Instrument", iconography:
  thin engraved-line; legibility over chrome), decision 0006 (brand-bible
  precedence), LOOP-DESIGN.md PASS 8.

## Decision 1 — every interactive icon honors a six-point contract

An icon a user can click is a promise. Each one ships with, and is reviewed
against, all six points:

1. **Hover tooltip** — its name, plus the keyboard shortcut where one exists.
2. **Screen-reader label** — an `aria-label` (or visible text) that names the
   action, not the picture.
3. **Observable effect** — clicking visibly does something. An icon that fails
   this is a defect to fix or a control to remove, never a styling gap.
4. **State legible beyond color** — toggles carry `aria-pressed` plus a
   non-color cue (fill, glyph, or text change).
5. **Keyboard reachable** — a real `<button>` (or equivalent) with a visible
   `:focus-visible` ring.
6. **Register fit** — workshop surfaces read warm/brass, instrument surfaces
   steel/mono, per 0006; glyphs are thin engraved-line, no glow.

## Decision 2 — relay sync never wears cloud imagery

Alfred's sync is the user's own Nostr relays — infrastructure they choose and
can run themselves. "Cloud" imagery and copy would claim the opposite of the
local-first promise. Canon:

- The sync indicator uses relay/beacon iconography (node + signal arcs), in
  all states (off / idle / syncing / error).
- User-facing copy says what it is: sync **over your Nostr relays** ("relay
  sync"). The words "cloud sync" do not appear in the product.

## Consequences

- PASS 8 applied the contract across the HEAD inventory (nav, toolbar, tabs,
  sidebar header, dialogs, status bar, agent panel) and replaced the cloud
  glyphs/copy in the status bar, onboarding, and file info dialog.
- New surfaces inherit the contract; reviews check against this list.
