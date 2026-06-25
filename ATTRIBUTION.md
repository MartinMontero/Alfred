# Attribution

Alfred is built on, and is a derivative work of, the open-source project
**Onyx** by **Derek Ross** and the Onyx contributors.

## Upstream work

| Field | Value |
|---|---|
| Project | Onyx — a private, encrypted, Nostr-native Markdown note-taking app |
| Author | Derek Ross and the Onyx contributors |
| Repository | https://github.com/derekross/onyx |
| Imported commit | `62d6d58d2af7a57f9a5954c611de47f252cb27bd` (`main`, package version `0.16.1`) |
| Import commit date | 2026-06-24 |
| Upstream license | MIT |

The upstream project declares the MIT license in its package metadata
(`package.json`, `src-tauri/Cargo.toml`, `zapstore.yaml`) but ships no standalone
`LICENSE` file at the imported commit. The MIT terms are preserved verbatim in
[`LICENSE.onyx`](LICENSE.onyx), attributed to Derek Ross and the Onyx
contributors, as required by the MIT license's notice clause.

## This derivative

| Field | Value |
|---|---|
| Project | Alfred — sovereign, local-first, Nostr-native PKM for agentic AI development |
| Part of | `wecanjustbuildthings.dev` |
| Repository | https://github.com/MartinMontero/Alfred |
| License | AGPL-3.0-or-later (see [`LICENSE`](LICENSE)) |

## Summary of changes from upstream (Phase 0)

- Severed upstream git history; started a fresh, independent history (clone, not fork).
- Relicensed the derivative to **AGPL-3.0-or-later**; preserved the upstream MIT
  notice in `LICENSE.onyx`; added `NOTICE` and `UPSTREAM.md` (pinned source SHA +
  security cherry-pick cadence).
- Re-identified the application from **Onyx** to **Alfred**: app/product name,
  package and crate names, Tauri bundle identifier (`com.onyxnotes.dev` →
  `dev.wecanjustbuildthings.alfred`), deep-link scheme (`onyx://` → `alfred://`),
  internal storage namespaces, PWA manifest, and user-facing copy.
- Persisted the project's standing context into the repo as `CLAUDE.md` and
  `AGENTS.md`, and placed the research bundle into `docs/research/`.

Further phases (1–7) continue the evolution: removing OpenCode/OpenClaw and the
Soapbox-maintained Nostr stack, hardening provider exclusion, and adding the
agentic vault, MCP server, goose harness, observability, and the AT Protocol pack.
See `docs/audit/` for the per-phase record.

## Third-party licenses of note

- `nostr-tools` (nbd-wtf) is published under the **Unlicense** (not MIT) — permissive
  and AGPL-compatible; recorded here and in the SBOM for accuracy.
