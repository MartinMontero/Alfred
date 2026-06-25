# Upstream provenance

Alfred is an independent, **cloned (not forked)** evolution of the MIT-licensed
`derekross/onyx`. Upstream history was deliberately severed; this repository
starts a fresh history. This file is the auditable record of where the code
came from and how security fixes are tracked.

## Source

| Field | Value |
|---|---|
| Upstream repository | https://github.com/derekross/onyx |
| Upstream branch | `main` |
| Upstream version at import | `0.16.1` (from `package.json` / `src-tauri/Cargo.toml` on `main`) |
| **Imported commit (pin)** | `62d6d58d2af7a57f9a5954c611de47f252cb27bd` |
| Import commit date | 2026-06-24 |
| Imported on | 2026-06-25 |
| Upstream license | MIT (declared in `package.json`, `src-tauri/Cargo.toml`, `zapstore.yaml`) |
| Alfred license | AGPL-3.0-or-later |

> **Note on the upstream LICENSE file:** upstream `derekross/onyx` declares MIT
> in its package metadata but does **not** ship a standalone `LICENSE` file at
> the pinned commit. To honour the MIT terms, `LICENSE.onyx` reproduces the
> canonical MIT license text attributed to Derek Ross and the Onyx contributors.
> See `ATTRIBUTION.md`.

## Why clone, not fork

Full independence from upstream governance and direction. The trade-off is that
upstream security fixes do **not** arrive automatically. The cadence below is how
we keep independence from meaning "missing security fixes."

## Security cherry-pick cadence

- **Monthly** (and on any disclosed upstream advisory), review the upstream
  `main` log since the last reviewed commit for **security-relevant** changes
  (crypto, Nostr signing/encryption, key handling, path/IO, deep-link parsing,
  dependency CVE bumps).
- Cherry-pick **only** security fixes; new features are evaluated separately and
  re-derived against Alfred's constraints (vendor exclusion, zero-Soapbox).
- Record each pulled fix here: upstream SHA, date, what it fixes, and the Alfred
  commit that lands it. **The builder is told whenever a back-port is pulled in**
  (standing context rule 9).

### Back-port log

| Date | Upstream SHA | Fixes | Alfred commit |
|---|---|---|---|
| _(none yet)_ | | | |
