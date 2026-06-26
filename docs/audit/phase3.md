# Phase 3 audit — the Alfred MCP server

**Date:** 2026-06-26
**Build target:** native Windows 11
**Goal:** expose the Phase-2 agentic vault as ground truth to any MCP harness
(goose, Claude Code) over stdio — strict, path-confined, traversal-proof.

## Versions (confirmed against verification-pass-2026-06.md before install)

- `@modelcontextprotocol/sdk` **v1.29.0** (MIT), spec **2025-11-25 (stable)**, Zod
  schemas, stdio transport. **Not** built on the v2 RC. W3C Trace Context key
  names (`traceparent`/`tracestate`/`baggage`) adopted as a constant for
  forward-compat (full wiring is Phase 5).
- Dependencies added (approved): `@modelcontextprotocol/sdk@^1.29.0`,
  `zod@^4.4.3` (the SDK resolved zod 4; pinned to match — range `^3.25 || ^4.0`),
  and **`@types/node` (devDependency, type-only)** to typecheck the node server.
  L1+L2 exclusion gate clean after install; no Meta/OpenAI/xAI/Soapbox provenance.

## Architecture

A standalone Node server under `mcp/` (run via `tsx mcp/run.ts <vault>`); **not**
bundled into the Tauri/PWA frontend. It **reuses the Phase-2 pure modules as the
source of truth** and does not reimplement the vault.

| File | Role |
|---|---|
| `mcp/vault-fs.ts` | security core — node:fs with strict path confinement |
| `mcp/transport.ts` | **isolated** transport (stdio default; opt-in HTTP) |
| `mcp/server.ts` | `createAlfredMcpServer(vaultRoot)` — resources + tools + `main()` |
| `mcp/search.ts` | text + frontmatter + tag + backlink-aware search (reuses frontmatter + wikilink extractor) |
| `mcp/markdown.ts` | structure-preserving append/patch under a heading |
| `mcp/naddr.ts` | NIP-19 `naddr` addressing (reuses `nostr-tools` nip19) |
| `mcp/run.ts` | stdio entry point |

Build wiring: `mcp/tsconfig.json` (node lib/types) + `typecheck:mcp` chained
into `verify:all`; `mcp/**/*.test.ts` added to the Vitest include.

## Transport (isolated for the 2026-07-28 migration)

- **stdio is the default and the only thing enabled by default** — no network
  listener.
- Streamable HTTP is **opt-in** via `ALFRED_MCP_HTTP=1`; when enabled it binds to
  loopback with **DNS-rebinding protection on** (`enableDnsRebindingProtection`,
  `allowedHosts`/`allowedOrigins` pinned to localhost). Remote MCP over HTTP
  remains a stop-and-ask.

## Resources (read-only) — by path and by NIP-19 naddr

`alfred://hot`, `alfred://note/{path}`, `alfred://naddr/{naddr}`.

## Tools (11) — every input strict (`additionalProperties:false`), every path confined

`vault_search`, `vault_read` (resolves `[[wikilinks]]`), `vault_append`,
`vault_patch` (structure-preserving, never clobber), `vault_write` (guarded),
`frontmatter_get`, `frontmatter_set`, `memory_bank_read`, `memory_bank_update`
(durable, provenance-stamped), `hot_read`, `spec_read`.

## Security (mandatory) — implemented and tested

- **Untrusted input + path confinement.** `VaultFs.resolve` rejects, explicitly
  and platform-independently, every traversal shape: `../`, `..\`, absolute
  `C:\`, drive-relative `C:foo`, UNC `\\server\share` and `//server/share`,
  root-relative `/x`/`\x`, plus a resolved-containment check and null-byte guard.
- **Strict schemas.** Every tool uses `z.strictObject` → the advertised JSON
  Schema is `additionalProperties:false` and unknown keys are **rejected** at
  call time (verified over the live protocol via an in-memory client).
- **Provenance on durable writes.** `memory_bank_update` appends under a heading
  with a `provenance: mcp · <iso> · review before trusting` stamp; it is
  append-only (never clobbers) and confined to `memory-bank/`.
- **No keys exposed.** The server reads/writes notes only; it never touches the
  credential store.

### Security tests (in `mcp/server.test.ts` + `mcp/vault-fs.test.ts`)

- Traversal refusal across **Unix, Windows backslash, absolute `C:\`, UNC,
  drive-relative, root-relative** — 12 attack shapes, all refused.
- Additional-property rejection on every tool (strict schema), over the protocol.
- Durable Memory Bank write carries provenance and cannot escape `memory-bank/`.
- Integration: an in-memory client connects, reads `hot.md` + a note + a Memory
  Bank file, resolves wikilinks, runs a guarded append.

## Verification

- `npm run verify:all` — **green**: `tsc --noEmit` + `typecheck:mcp`, **117
  Vitest tests** (79 Phase-2 + 38 MCP), L1+L2 exclusion gate (clean), L3 advisory,
  `build` (Tauri frontend) + `build:web` (PWA).
- Docs: `docs/mcp-server.md` (goose + Claude Code registration). README
  "Status" banner refreshed (Phases 0–3).

## Notes / scope boundaries

- The server runs via `tsx` (no separate compile step); a bundled/compiled
  distribution can come with the goose embedding in Phase 4.
- naddr addressing maps an identifier (the `d` tag) to a note's frontmatter `id`;
  a vault-wide pubkey context (for full naddr encode in app) arrives with the
  shared-identity work in Phase 7.

**Stop for review before any push.**
