<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# Changelog

**DRAFT — for human review (2026-09-07). Not yet adopted.**

All notable changes to Alfred are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Alfred is in
open beta: tags follow `v0.x.0-beta.N` and each tag maps to a distinct numeric app version (the
updater orders on the numeric version — see `docs/release-process.md`, "Tag ↔ numeric version
mapping"). Tester-facing release notes per tag live in `docs/beta/RELEASE-NOTES-<tag>.md`; this
file summarizes and links them.

**Tag ↔ numeric map so far:** `v0.1.0-beta.1` ↔ 0.1.0 (never published) · `v0.1.0-beta.2` ↔
0.1.1 (published 2026-07-19) · `v0.1.0-beta.3` ↔ 0.1.2 · `v0.1.0-beta.4` ↔ 0.1.3 (tagged, never
published) · `v0.1.0-beta.5` ↔ 0.1.4 (draft, pending).

## [Unreleased]

## [0.1.4] — v0.1.0-beta.5 — DRAFT / PENDING (not yet tagged or published)

A re-cut of the beta line from current `main`. beta.4 was never published and never will be —
its tag pointed at a tree that predated two load-bearing changes; beta.5 is the first
publishable tag containing what it claims to ship. **The release notes for this version are
themselves a draft awaiting Martin's review (authored 2026-09-01)**; the bullets below reflect
that draft's labeled-verified items only.

- goose sidecar bumped 1.41.0 → 1.43.0 (the Holmes guard was verified against 1.43.0; the
  beta.4 tag still pinned 1.41.0 — that version skew is the reason this re-cut exists). The
  live-goose trio against 1.43.0 is still UNVERIFIED as of the draft notes.
- Desktop-only is settled (ADR-0010): there is no user-facing web build; the web build exists
  only as an internal CI harness, guarded by test.
- Additional tester-visible changes between beta.3 and the cut point are a TODO marked for
  Martin in the draft notes.

Full notes (draft): [docs/beta/RELEASE-NOTES-v0.1.0-beta.5.md](docs/beta/RELEASE-NOTES-v0.1.0-beta.5.md)

## [0.1.3] — v0.1.0-beta.4 — TAGGED, NEVER PUBLISHED

Tagged but never published and never will be (superseded by beta.5 — see above). Recorded here
for completeness because the tag and the numeric version 0.1.3 are spent.

- The provider guard became compiled code: which AI providers the agent can use, and how every
  agent session is launched, is decided by a compiled policy layer (ADR-0008, Holmes
  `holmes-guard`), not editable text. Excluded vendors are refused before the agent starts.
- New Evidence panel: analytical findings after they pass an evidence gate, with each finding's
  limits stated in full. The investigative (collection) mode is not switched on.
- Build-time artifact check: every build is probed against the real installed binary to confirm
  the guard refuses excluded providers and clears hostile settings.

Full notes: [docs/beta/RELEASE-NOTES-v0.1.0-beta.4.md](docs/beta/RELEASE-NOTES-v0.1.0-beta.4.md)

## [0.1.2] — v0.1.0-beta.3

The first update delivered through Alfred's own in-app updater.

- Create a vault from anywhere: both vault menus and the sidebar Vaults entry can make a new
  vault, not just open existing folders.
- Sync says what it is: notes sync over your own Nostr relays — the cloud icon and "cloud sync"
  wording are gone.
- The agent is one click away: the "agent idle" status opens the agent panel, and every icon
  has a readable hover name.

Full notes: [docs/beta/RELEASE-NOTES-v0.1.0-beta.3.md](docs/beta/RELEASE-NOTES-v0.1.0-beta.3.md)

## [0.1.1] — v0.1.0-beta.2 — 2026-07-19

Published 2026-07-19 (per `docs/release-process.md`). **No per-tag release-notes file for this
version exists in `docs/beta/`** — the per-tag notes convention began with beta.3. [VERIFY]
what shipped in beta.2 from git history before this section can be filled in honestly.

## [0.1.0] — v0.1.0-beta.1 — never published

Tagged but never published (per `docs/release-process.md`). No release-notes file exists for
this version.

---

Known issues at any point in the beta: [docs/beta/known-issues.md](docs/beta/known-issues.md).
Security fixes and supported-version policy: [SECURITY.md](SECURITY.md).
