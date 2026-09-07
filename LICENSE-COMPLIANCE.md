<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# License compliance

**DRAFT — for human review (2026-09-07). Not yet adopted.**

This document records Alfred's license posture in one place: what Alfred itself is licensed
under, how its upstream attribution is preserved, and the licenses of its notable dependencies,
with the source of each claim stated explicitly.

## Alfred itself

Alfred is licensed solely under **AGPL-3.0-or-later**:

- The full license text is in [`LICENSE`](LICENSE).
- Every source file carries an SPDX header
  (`SPDX-License-Identifier: AGPL-3.0-or-later`).
- This is a single-license project: there is no dual licensing and no contributor agreement
  that would permit relicensing.

## Upstream attribution (preserved, required)

Alfred is a derivative work of **Onyx** by **Derek Ross** and the Onyx contributors
(`https://github.com/derekross/onyx`), which is MIT-licensed. The MIT license requires its
notice to be preserved; Alfred preserves it in:

- [`THIRD-PARTY-NOTICES/onyx-MIT.txt`](THIRD-PARTY-NOTICES/onyx-MIT.txt) — the canonical MIT
  text attributed to Derek Ross and the Onyx contributors. Upstream declares MIT in its package
  metadata but shipped no standalone `LICENSE` file at the imported commit, which is why the
  text is reproduced here.
- [`ATTRIBUTION.md`](ATTRIBUTION.md) — the source project, author, imported commit, and a
  summary of Alfred's changes.
- [`UPSTREAM.md`](UPSTREAM.md) — the provenance record: imported commit
  `62d6d58d2af7a57f9a5954c611de47f252cb27bd` (upstream `main`, package version `0.16.1`,
  import commit date 2026-06-24), and the monthly security cherry-pick cadence.
- [`NOTICE`](NOTICE) — the notice file.

Preserving the MIT notice is an obligation; it does not relicense any Alfred code — the
derivative as a whole is AGPL-3.0-or-later.

## Notable dependency licenses

The table below covers the notable entries. The "Source of claim" column says where each
statement comes from; entries not yet machine-verified against the SBOM are marked
**[VERIFY]**. This table is a human-readable summary, not the source of truth (see below).

| Component | License | Source of claim |
|---|---|---|
| `nostr-tools` (Nostr stack) | Unlicense | Project constitution + `ATTRIBUTION.md` (explicitly recorded as Unlicense, not MIT) |
| `@noble/ciphers`, `@noble/hashes` (crypto) | MIT [VERIFY] | Project constitution tooling table |
| `holmes-core`, `holmes-guard` (compiled agent guard) | AGPL-3.0-or-later | `docs/decisions/0008-holmes-guard-adoption.md` (dependency screen 2026-07-22: both crates AGPL-3.0-or-later, zero third-party packages added to `Cargo.lock`) |
| goose sidecar binary (the agent harness) | Apache-2.0 | Project constitution tooling table (AAIF goose, `aaif-goose/goose`). Shipped as a **separate, unmodified binary** executed as its own process — not linked into Alfred — so its Apache-2.0 terms apply to that binary, not to Alfred's code. [VERIFY] the binary's own notices are shipped alongside it in the installer |
| Tauri (framework + plugins) | MIT / Apache-2.0 [VERIFY] | Upstream project metadata (tauri.app); not yet machine-verified here |
| SolidJS (frontend framework) | MIT [VERIFY] | Upstream project metadata |
| Milkdown (editor) | MIT [VERIFY] | Upstream project metadata |
| CodeMirror 6 (editor) | MIT [VERIFY] | Upstream project metadata |

### The machine-checked source of truth

The table above is a summary written by hand. The authoritative record is the **Syft SBOM**
produced on every CI run: the `supply-chain` job in `.github/workflows/ci.yml` generates a
Software Bill of Materials in SPDX JSON format (`alfred-sbom.spdx.json`, uploaded as a build
artifact), covering the app and the sidecar. When this document and the SBOM disagree, the SBOM
wins, and this document should be corrected. Anything in the table marked [VERIFY] is a claim
not yet checked against that artifact.

### Security exceptions are not licenses

`docs/security/dependency-allowlist.md` records time-boxed, adjudicated **vulnerability**
exceptions (three advisory IDs at time of writing, each with proof, triggers, and a review
date). It has nothing to do with licensing and grants no license exceptions; it is listed here
only so the two kinds of "allowlist" are not confused.

## Vendor exclusions (separate from licensing)

Independently of licenses, Alfred excludes Meta-, OpenAI-, and xAI-owned dependencies and
endpoints by constitution, and carries zero Soapbox-provenance packages. These are policy
exclusions enforced by CI (the platform exclusion engine plus a zero-Soapbox check), not
license judgments.

## A note for anyone hosting a modified Alfred

Alfred itself ships desktop-only (`docs/decisions/0010-no-hosted-web-app.md`); there is no
hosted service. But AGPL-3.0-or-later section 13 applies to anyone who modifies Alfred and lets
users interact with the modified version **over a network**: those users must be offered the
complete corresponding source of the modified version. If you build a service on modified
Alfred code, that obligation is yours. Distributing the unmodified desktop app is ordinary
distribution under the AGPL's normal terms (source offer, license and notices intact).
