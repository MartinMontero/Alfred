# Alfred open beta — known issues (draft for W8; grows until the tag)

**Status:** draft, started 2026-07-14 under the ship-first ruling. Every entry states what a
tester will see, what we know, and what reports would help. Honesty over polish — an issue
listed here is a promise that we know, not an apology.

## 1. Evidence badge may not appear on notes with provenance fields

Notes can carry evidence frontmatter (`confidence`, `sources`, validity dates — see ADR-0005).
The Properties panel shows a badge for them. In pre-beta testing the badge failed to appear in
at least one walk; the note involved turned out to have corrupted frontmatter (see issue 2), and
a controlled re-test was superseded by the ship decision. Parked as
**[UNVERIFIED — deferred to open beta]**: if you add `confidence: 0.9` to a note whose first
line is exactly `---` and see no badge in the Properties panel, that report is exactly the
instrument we need — include the note's first 12 lines.

## 2. Frontmatter corruption by the editor round-trip — FIXED in `57f4ca7`

Markdown treats `---` as both a frontmatter fence and a horizontal rule; the editor's
serializer used to rewrite an unprotected fence (`***`), after which property edits stacked
duplicate frontmatter blocks. Fixed in `57f4ca7`: frontmatter never enters the serializer
(split-and-hold), displaced blocks surface a warning instead of stacking, and red-first
regression tests pin the mechanism (fence survives the round-trip; property apply is
idempotent; the clean badge fixture parses end-to-end). Notes corrupted BEFORE the fix are not
auto-repaired — the Properties panel now tells you when a note needs its frontmatter moved back
to the top. If the beta reproduces fresh corruption, the note's top 12 lines are gold.

## 3. Graph does not retint on live accent change

Changing the accent color in Settings retints the app immediately but an already-open graph
keeps its old colors until the graph view is reopened. Pre-existing limitation, cosmetic.

## 4. Selecting the dark theme resets a custom accent color

Choosing "Dark" in Settings auto-applies the default brass accent, discarding a custom accent.
Inherited behavior, kept for the beta, flagged.

## 5. `npm audit` prints a uuid/exceljs advisory pair (expected, adjudicated)

Developers running raw `npm audit` in the repo will see a moderate uuid advisory via exceljs.
This is adjudicated NOT AFFECTED (the vulnerable functions are never invoked — full trace in
docs/audit/stage-d-vulnerability-decision.md) and npm has no ignore mechanism, so it keeps
printing. Never run `npm audit fix --force` — it installs a breaking exceljs downgrade.

## Skills are locked this beta
Alfred's skill system (reusable agent workflows) is switched off while its
security review finishes. The agent still reads, searches, and — with your
approval — writes notes; skills return in a later beta.

## Investigative mode is not shipped this beta
The Evidence panel shows analytical findings after they pass the evidence gate,
with each finding's limits stated in full. Collecting the evidence for you — the
investigative mode — is **not switched on** this beta: it sits behind separate
safety gates (targeting limited to power, never private individuals; disclosure
only with recorded consent; tool use only after your explicit approval). What
you see this beta is the review surface, not a collector.

## Updating from beta.2 needs one manual install
beta.3's update feed pointed at the MSI installer while your app was installed
by the setup.exe (NSIS, per-user) — so the in-app update either did nothing or
installed a second, separate copy under `C:\Program Files\Alfred`, and About
kept showing 0.1.1. To get current: download `Alfred_x64-setup.exe` from the
latest release page and run it once — it updates your existing install in
place. If Settings → Apps shows two Alfred entries, uninstall the one whose
location is `C:\Program Files\Alfred` (keep the AppData one). From beta.4 on,
the feed serves the right installer type and in-app updates work again.
