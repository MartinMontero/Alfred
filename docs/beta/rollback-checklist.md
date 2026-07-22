# Rollback checklist (beta) — how to put a prior build back in testers' hands

**Status:** authored 2026-07-22 (Holmes Stage 1, Track 3 item 3). Plain-language companion to
`docs/release-process.md` (§Rollback). This is the checklist Martin runs; it is consistent with
the tauri updater's version comparator and journey J6. **No step here publishes anything** — the
verification is a dry run against a local `latest.json`. Publishing a real rollback release is a
separate, deliberate human action.

## The one rule that shapes everything

The tauri updater **refuses same-or-lower version numbers.** An installed app only takes an update
when the feed's **numeric** version is *greater* than what's installed (the tag string is display
only — see the tag↔numeric map in `docs/release-process.md`). So you cannot "downgrade" by pointing
the feed back at an older number. **A rollback is a higher-numbered release that carries the older,
known-good code.**

Example: testers are on `0.1.2` (`v0.1.0-beta.3`) and it has a bad regression. You do NOT re-point
the feed at `0.1.1`. You cut `0.1.3` (`v0.1.0-beta.4`) built from the last-good tree and publish
that. Everyone moves *forward in number, backward in code.*

## Before you need it (standing readiness)

- [ ] The **last-known-good installer stays attached to its release, permanently.** The install
      guide links "previous version" so a tester can always reinstall by hand, updater or not.
- [ ] The **updater keypair is escrowed** (password manager **and** an offline copy). Losing it
      means installed apps can never update again — a rollback would then be reinstall-by-hand only.
      This is a release blocker, not a nicety.
- [ ] You can build the app from any prior tag on a clean tree (`git checkout <tag>` → `npm ci` →
      `npm run stage:goose` → `npm run tauri build`).

## Rollback dry run (J6 — do this to prove the mechanism, no publish)

Goal: confirm an installed app on the bad version would actually be offered, and accept, the
rollback build — **against a LOCAL `latest.json`, nothing live.**

1. **Build the rollback candidate.** Check out the last-good tree, bump the numeric patch to the
   next number above the bad one (e.g. bad `0.1.2` → rollback `0.1.3`), keep the good code. Build
   the installer + `.sig` + `latest.json` (the release lane emits all three; a dry-run dispatch
   with a `dryRunTag` produces a draft you inspect and delete).
2. **Serve the rollback `latest.json` locally.** Point a local file/URL at the draft's
   `latest.json` (version `0.1.3`, the rollback installer's URL, the embedded minisign signature).
3. **On a machine running the bad version**, run the in-app check (Settings → About → Check for
   updates) against that local feed. Expected: **update offered → version `0.1.3` → signature
   verifies → installs → app relaunches on the good code.** That is the rollback proven.
4. **Confirm the comparator floor holds:** on a machine already at `0.1.3`, the same check reports
   "you're up to date" (it must NOT re-offer, and must never offer a lower number). This is the
   guard that a rollback can only ever move testers forward-in-number.
5. Record the walk (versions, HTTP 200 on the feed, "signature verified", relaunched version) in
   the release notes. Delete the draft.

## When you actually publish a rollback (the live action, deliberate)

- [ ] The rollback build passes the **full release gate** (CI green, the Windows live-goose recipe
      test executed, the artifact-guard job green — a rollback is still a release).
- [ ] The rollback numeric is strictly greater than the bad version's numeric.
- [ ] Release notes state plainly, in tester language, that this build **reverts** the regression
      and names what changed back.
- [ ] After publishing: from a real install on the bad version, verify the live updater offers and
      installs the rollback (the same walk as the dry run, now against the live feed).
- [ ] Keep the bad release's page up (do not delete history) but link testers to the rollback as
      the current build.

## What a rollback is NOT

- Not re-pointing `latest.json` at an older numeric — the comparator refuses it; installed apps
  would simply never update.
- Not deleting the bad release — that only strands anyone who hasn't updated yet.
- Not a data downgrade — vault schema changes ship with a down-migration note *before* the release
  that introduces them (`docs/release-process.md` §Rollback → Data). No migration, no schema change.
