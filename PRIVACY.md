<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# Alfred privacy policy

**DRAFT — for human review (2026-09-07). Not yet adopted.**

Alfred is a local-first desktop application for Windows. The short version: your notes, your
keys, and your usage data stay on your machine. Alfred has no user-facing hosted service
(desktop-only by decision, `docs/decisions/0010-no-hosted-web-app.md`), and the Alfred project
collects no data from you at all.

## What Alfred stores, and where

- **Your vault.** Your notes are plain Markdown (`.md`) files in a folder you choose on your own
  disk. They are plaintext at rest — the protection boundary is your operating system's user
  account and disk encryption, which are your controls (full-disk encryption is recommended and
  is not something Alfred can do for you). If Alfred disappeared tomorrow, every file would
  still open in any text editor.
- **Your Nostr private key (nsec).** Stored in the Windows OS credential store (keyring service
  `dev.wecanjustbuildthings.alfred`) — never in a plain file, never logged, and it never leaves
  your machine except at your explicit action (for example, if you copy it yourself to back it
  up). Only non-secret metadata (your public key, login id, profile fields) is kept outside the
  credential store.
- **AI provider keys.** Keys for the built-in Direct Chat are stored via the OS credential
  store. One honest caveat: if the credential store is locked or unavailable, Direct Chat key
  reads fall back to (and writes land in) plaintext local application storage
  (`src/lib/ai-credentials.ts`) so you do not lose a working key — this fallback is documented
  in `docs/threat-model.md` (Surface 7) and surfacing a warning when it is active is tracked
  work. Keys for the agent (goose sidecar) are passed to the agent process as environment
  variables only, with the OS keyring deliberately disabled for it (`GOOSE_DISABLE_KEYRING=1`),
  and are never written to disk by Alfred.
- **Settings and sync metadata.** Relay lists, sync cursors, and similar bookkeeping live in the
  app's local storage on your machine.

## What Alfred never does

- **No telemetry without your explicit opt-in.** Usage telemetry is off by default. Until you
  turn it on, nothing is recorded.
- **Even when opted in, telemetry is born-redacted and local-only.** The telemetry store
  (`src-tauri/src/telemetry.rs`) is a typed allowlist: the only things it can hold are counts,
  durations, booleans, bounded enums, stable names (tool name, model name, provider name), token
  counts when the agent reports them, and W3C trace/span correlation ids. There is no field —
  anywhere in the schema — for note content, prompts, tool arguments, keys, or file paths'
  contents, so such data cannot be written. Events older than 14 days are pruned automatically.
  A byte-scan test proves no note bodies or secrets reach the telemetry file on disk. **There is
  no transmitter in the codebase: even opted-in telemetry never leaves your machine.** It exists
  for your own inspection. The one design residue to be aware of: trace correlation ids exist by
  design so events from one agent session can be linked together.
- **No telemetry about your notes' content, ever.** "Erase collected data" performs an honest
  wipe: records are deleted, the database file is checkpointed and vacuumed so the bytes are
  actually gone, and the app reports how many records were removed.

## Network behavior

Alfred talks to the network only in these cases:

1. **Nostr sync, only if you configure it.** If you enable sync, Alfred connects only to the
   Nostr relays you yourself entered. File contents, the vault index, and shared documents
   (event kinds 30800, 30801, 30802) are encrypted with NIP-44 using your own keys **before**
   anything leaves your machine; relays only ever hold ciphertext. Published and draft articles
   (kinds 30023, 30024) are public by design — publishing is a deliberate act you perform. See
   the "How sync works" table in `README.md` for the full kind-by-kind list. You may also
   configure Blossom file servers (kind 10063); those are, again, only servers you chose.
2. **Update checks, only when you click.** Alfred checks for updates solely when you press
   "Check for updates" in Settings → About, and download/install is a second, separate click.
   The check is a single request for `latest.json` from the Alfred repository's GitHub Releases
   feed (`https://github.com/MartinMontero/Alfred/releases/latest/download/latest.json`).
   Nothing about you is sent beyond what any HTTPS request to GitHub carries (your IP address to
   GitHub).
3. **AI calls, only to your own configured provider.** Direct Chat and the agent call only the
   provider and endpoint you configured. Providers resolving to Meta, OpenAI, or xAI are refused
   at Alfred's configuration chokepoints (blocked before any session starts); for the agent
   surface, the compiled guard additionally pins outbound traffic to an exact allowlist of
   vendor API hosts (`docs/decisions/0008-holmes-guard-adoption.md`). What you send to your
   chosen provider is governed by that provider's privacy policy, not this one — Alfred does not
   insert itself into that exchange.

Alfred contains no advertising, no analytics SDKs, no crash-reporting service, and no other
outbound connections than the above.

## Third parties who may see some data

- **GitHub** — only if you click "Check for updates" (it serves the release feed).
- **Your chosen Nostr relays and Blossom servers** — they hold your encrypted content (or public
  articles, if you publish) and can see connection metadata like any server operator.
- **Your chosen AI provider** — sees whatever prompts and note content you send it in a chat or
  agent session. Choose a provider whose terms you accept, or run a local model (e.g. via
  Ollama) so nothing leaves the machine at all.

The Alfred project itself receives nothing: no account, no usage data, no crash reports.

## Your controls

In **Settings → Privacy & Telemetry** you can:

- **Toggle telemetry** on or off (off is the default; the toggle is the only switch).
- **Export collected data** — download everything stored in the local telemetry database as a
  JSON file, so you can see exactly what was recorded.
- **Erase collected data** — permanently delete all collected telemetry (the app reports how
  many records were removed). Your notes are never affected.

Sync is off unless you enable it and enter relays; you can change or remove relays at any time.
Deleting your vault folder and uninstalling the app removes everything Alfred stored, except
whatever you chose to publish publicly on Nostr (public events are yours to delete via Nostr's
own mechanisms).

## Contact

Questions or concerns about privacy: open an issue at
`https://github.com/MartinMontero/Alfred/issues`. Security-sensitive reports should use GitHub's
private vulnerability reporting on that repository (see `SECURITY.md`).

## Changes to this policy

This policy lives in the repository and changes with it. The history of this file is the history
of the policy.
