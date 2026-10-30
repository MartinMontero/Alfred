# Alfred v0.1.0-beta.6 — release notes

**Tag:** `v0.1.0-beta.6` (numeric version **0.1.5**)
**Status:** pending tag + publish (Rule 9: Martin's clicks).
**Theme:** the updater now leaves evidence and releases its own locks.

## Why this release exists

beta.5's in-app update died silently during apply. No log, no error, no update. beta.6 is the
fix for that class of failure: it makes the failure visible, and it removes the most likely
mechanical cause.

## What changed (tester-facing)

- **Updates are now logged in release builds.** `tauri-plugin-log` is on in production, not
  just in debug builds. The log file lives in Alfred's local app-log directory, rotates at
  1 MB, and never contains your notes, prompts, or keys.
- **Every step of an update is traced before it happens.** Check → available → pre-apply →
  handoff → download → returned/error. If an update ever fails again, the log will show the
  exact step it died on instead of a shrug.
- **Alfred releases its own locks before the installer runs.** A new pre-apply step stops the
  goose sidecar and its children (on Windows, the whole tree) so the installer can replace
  files in the install directory. beta.5's silent death pointed squarely at a locked
  `mcp-server.cjs`.
- **The vault MCP server is dual-era.** It answers both the legacy `initialize` handshake
  (2025-11-25) and modern `server/discover` for 2026-07-28 clients — so goose keeps working
  while the protocol moves. Every read now carries an `expectedVersion` token; a write with a
  stale token is refused with CONFLICT and never overwrites a human edit.
- **goose sidecar is now 1.56.0** (was 1.48.0). A new test fails if the pin ever lands in
  only some of its four locations.
- **Dependency cleanup:** 12 RUSTSEC advisories cleared by lockfile bumps (rustls, quinn,
  webpki). The three `zip` advisories that can't be fixed by a bump are documented on the
  allowlist with proof and a 2027-01-29 review date — they are Unix-only extraction paths
  and Alfred ships Windows only.
- **CI is repaired:** the WebKitGTK driver package name changed on Ubuntu 26.04; the install
  now uses the new name with a fallback to the old one.

## Verify on your machine (after install)

1. Settings → About → **Check for updates** (this build ships 0.1.5, so it should say you're
   up to date; the point is that the check itself works and is logged).
2. Open the log directory (`%LOCALAPPDATA%\dev.wecanjustbuildthings.alfred\logs`) and confirm
   a log file exists and contains updater trace lines after a check.
3. Optional proof of the unlock: start a goose session, then apply the next update when it
   lands. The sidecar and its node child should be gone from Task Manager before the
   installer window appears.

## Rollback (if beta.6 misbehaves)

- **Rollback = revert the merge commit of the beta.6 release PR** and let Workers Builds
  redeploy the previous main. The prior public release stays available on the Releases page
  as a fresh installer.
- **Do not delete the beta.5 tag** if it exists; tags are history. A broken tag is fine to
  leave unpublished; never re-tag onto the same name after publication without Martin's
  explicit word.
- The in-app updater's fallback: if apply fails on your machine, install the next release
  manually from the Releases page; the log directory above will tell us why.

## Known open items (not blockers)

- The live-goose handshake trio is Windows-only and has not been re-run against 1.56.0 on a
  maintainer's machine yet. Re-stage with `npm run stage:goose` after installing.
- The updater feed (`latest.json`) is self-authored by the release lane; the release PR is
  where it gets written. **beta.5's feed was never published because beta.5 was a draft —
  this time the release must be PUBLISHED, not drafted.**
- The quick-xml/uuid allowlist review dates lapsed on 2026-10-14; a re-ratification or bump
  is queued behind this release.

## Links

- Beta.6 prep PR: https://github.com/MartinMontero/Alfred/pull/50
- Changelog entry: CHANGELOG.md §[0.1.5] — v0.1.0-beta.6
- Updater fixes: src-tauri/src/lib.rs (updater_trace, updater_pre_apply), src/lib/updater.ts
