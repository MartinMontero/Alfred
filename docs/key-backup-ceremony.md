<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# Key backup ceremonies

**DRAFT — for human review (2026-09-07). Not yet adopted.**

Two keys matter enough to deserve a written ceremony: the **updater signing keypair** (Martin's;
losing it means every installed Alfred can never update again) and each **user's Nostr private
key** (the user's; losing it means losing the identity that decrypts their synced vault). Both
ceremonies below are plain-language, checkbox format. Ceremony A is executed by Martin on his
Windows machine. Ceremony B is documentation for users; note the honest gap it currently ends
on.

Sources: `docs/release-process.md` (§Pipeline step 5), `docs/beta/rollback-checklist.md`
(§Before you need it), `.github/workflows/release.yml`, `src-tauri/tauri.conf.json`,
`README.md`, `docs/threat-model.md` (Surface 7), `src/lib/nostr/login.ts`, `src/lib/nostr/signer.ts`.

---

## Ceremony A — Updater signing keypair (Martin, one-time, plus escrow check per release)

**What this key is.** The Tauri updater signs every release's update artifacts with a minisign
private key. Installed apps carry the matching public key (`src-tauri/tauri.conf.json` →
`plugins.updater.pubkey`) and refuse any update whose signature does not verify. The release
workflow signs with the private key via the GitHub Encrypted Secrets
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
(`.github/workflows/release.yml`).

**Why it matters.** Losing the private key (or its password) means no release can ever be
signed so that already-installed apps accept it. Every installed user would have to reinstall
by hand, forever. `docs/beta/rollback-checklist.md` lists the escrow of this keypair as a
release blocker, not a nicety.

**Current state.** A keypair exists — the public key is already in `tauri.conf.json` and
beta releases have been signed. So for the existing key this ceremony is an **escrow
verification**; the generation steps are included for completeness (and in case of a fresh
start). [VERIFY] Whether the original generation was recorded anywhere — if not, the escrow
check below is the only proof the key is recoverable.

### A.1 Escrow verification (run now, and before every release)

- [ ] Open your password manager. Confirm it contains an entry holding the full
      `TAURI_SIGNING_PRIVATE_KEY` value (the private key text) and its password, exactly as they
      appear in the GitHub repository secrets.
- [ ] Confirm the **offline copy** exists: the private key and password on an encrypted offline
      medium (e.g. an encrypted USB drive) stored somewhere physically separate from the working
      machine. Check the medium actually reads.
- [ ] Prove the escrowed key is the live key, not a stale one: on a throwaway copy, verify a
      known release artifact's `.sig` against the escrowed key material, or compare the public
      key derivable from the escrowed private key against the `pubkey` in
      `src-tauri/tauri.conf.json`. [VERIFY] the exact minisign command used for this check
      (`minisign -V -P <pubkey> -m <file>` or `tauri signer sign` round-trip) at the time you
      run it.
- [ ] Record the date of this check in the release notes of the next tagged release.

### A.2 Generation (only if starting fresh — do NOT regenerate while installs exist)

Regenerating the keypair after users have installed the app is indistinguishable from losing
the key: installed apps carry the old public key and will reject everything signed with the new
one. Only do this before any install exists, or as a deliberate break-glass action with
reinstall instructions for every user.

- [ ] On Martin's Windows machine, in the repo: generate a new updater keypair with the Tauri
      CLI (`npm run tauri signer generate`), recording the private key and password directly
      into the password manager at generation time — never into a terminal scrollback, file on
      disk, or chat window. [VERIFY] the exact CLI invocation against the Tauri v2 docs at the
      time of execution.
- [ ] Update `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` with the new public key.
- [ ] Update the GitHub Encrypted Secrets `TAURI_SIGNING_PRIVATE_KEY` and
      `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the new values.
- [ ] Make the offline copy (A.1) immediately. Two copies exist before the first release is
      signed, or the ceremony is not complete.
- [ ] Confirm a release-lane dry run produces a `.sig` that verifies against the new `pubkey`.

### A.3 Rotation note

There is no supported in-place rotation: changing `pubkey` in a release causes every existing
install to reject that release's update (signature mismatch), which is the same failure as key
loss. If the private key is ever **compromised** (not merely lost), the honest path is: publish
a final release signed with the old key whose notes instruct users to reinstall from a fresh
installer signed under the new keypair, and say plainly what happened. [VERIFY] whether Tauri
v2 has since gained any key-rotation mechanism; do not assume one exists.

---

## Ceremony B — User Nostr key backup (per user; documentation)

**What this key is.** Alfred's Nostr identity is an `nsec` (private key). It decrypts your
synced vault content (kinds 30800/30801/30802 are NIP-44-encrypted with it) and it *is* your
Nostr identity — your npub, your published articles, your relay presence.

**Where Alfred keeps it.** In the Windows OS credential store (keyring service
`dev.wecanjustbuildthings.alfred`, key `alfred:login`), per `src/lib/nostr/login.ts` and
`docs/threat-model.md` (Surface 7). It is never written to a plain file and never logged; the
keyring is the only place it persists. Non-secret metadata (public key, login id, profile) is
stored outside the keyring.

**Why a backup matters.** The credential store is tied to your Windows user account on this
machine. If the machine dies, the Windows profile is wiped, or the credential store is
corrupted, the key is gone — and with it the ability to decrypt anything you synced and your
Nostr identity itself. Alfred cannot recover it for you; there is no server-side copy.

### B.1 Backing up

- [ ] Understand what you are protecting: the `nsec` is a secret. Anyone who has it *is* you on
      Nostr and can read your synced notes. Treat a written copy like a passport.
- [ ] Retrieve your `nsec` for backup. **Honest gap:** `src/lib/nostr/login.ts` exposes a
      `getNsecWithAuth()` function, but as of this draft **no screen in the app calls it** —
      there is currently no in-app "reveal / export my key" surface. The reliable moment to back
      up today is **at key creation or import**, when you have the `nsec` in hand (Alfred's
      login flow supports both generating a new keypair and importing an existing `nsec` or
      64-character hex key). [VERIFY] the onboarding/login UI flow and whether it displays the
      freshly generated `nsec` for the user to save; an in-app reveal/export surface is owed
      work and should be tracked as an issue.
- [ ] Write the `nsec` down on paper, or store it in your own password manager, or both. Keep at
      least one copy off the machine Alfred runs on.
- [ ] Verify the backup before trusting it: import the saved `nsec` into a second Nostr client
      (or re-import it into Alfred on another machine/profile) and confirm the public key (npub)
      matches the one shown in Alfred. [VERIFY] where in the Settings UI the npub is displayed.
- [ ] Store the backup somewhere it survives the loss of this Windows account. The keyring does
      not roam between machines; neither will your key, without this copy.

### B.2 Restoring

- [ ] Install Alfred (any machine).
- [ ] At the login screen, choose import and paste your backed-up `nsec` (or the 64-character
      hex private key — Alfred's import accepts both, `src/lib/nostr/login.ts`).
- [ ] Confirm your npub and profile appear, then re-run sync from Settings → Sync to pull your
      encrypted vault content back from your relays.

### B.3 What Alfred will never do with this key

- Never log it, never include it in telemetry (the telemetry schema has no field that could
      hold it — see `PRIVACY.md`), never send it anywhere. The only network use of the key is
      signing and NIP-44 encrypting/decrypting locally, before content touches a relay.
