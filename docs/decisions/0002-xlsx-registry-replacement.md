# 0002 — Spreadsheet parser: replace CDN-distributed SheetJS with registry-published exceljs

**Status:** accepted (2026-07-12)
**Decider:** builder (Martin Montero) — chose replacement over vendoring; the specific package was selected against the criteria below.
**Phase:** decided during Phase 5, ahead of the CI-gate work; executed immediately.

## Context

`xlsx@0.20.3` was the only dependency fetched from outside the npm registry: a raw
tarball URL (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), inherited from
upstream onyx. That shape carries three problems:

1. **Supply chain.** A bare tarball URL has no registry provenance, cannot be
   watched by Renovate or the weekly maintenance watcher, and is exactly the
   pattern the planned OSV/Grype/SBOM gates exist to flag.
2. **Reproducibility.** Locked-down build environments that allow the npm
   registry but not arbitrary hosts cannot install at all — this bit the remote
   build container (proxy 403 on `cdn.sheetjs.com`) before it would bite CI.
3. **No safe registry fallback.** The npm-registry `xlsx` is frozen at 0.18.5
   with known vulnerabilities (prototype pollution, ReDoS) fixed only in the
   CDN-distributed line, so "just use the registry version" is a dead end.

## Options considered

- **(a) Vendor the 0.20.3 tarball in-repo.** Keeps an unauditable binary blob in
  history, still SheetJS-CDN-sourced, no update path, and the tarball could not
  even be fetched from the restricted environment doing the work.
- **(b) Registry `xlsx` 0.18.5.** Known CVEs; would fail the Stage-D scanners the
  moment they land.
- **(c) Replace with `exceljs` (^4.4.0, MIT, npm registry).** Actively used
  community package; dependency tree contains no Meta/OpenAI/xAI provenance and
  no React (verified: `npm ls react` empty; exclusion engine layers 1+2 pass on
  the updated lockfile); overlaps with deps already in the tree (`dayjs`,
  `jszip`, `uuid`).

## Decision

Option (c). `src/components/XlsxViewer.tsx` is the sole consumer and uses the
library read-only as a parser; evaluation stays in HyperFormula. Formula cells
pass their (shared-formula-translated) text through as before; when no formula
text is recoverable, the file's cached result is used.

## Consequences

- All Alfred dependencies now resolve from the npm registry — full coverage for
  the supply-chain gates and for Renovate at Stage D.
- Behavior delta in the viewer: date cells render as ISO strings (previously raw
  Excel serial numbers); rich text, hyperlinks, and error cells are mapped to
  their display text.
- `exceljs` is a larger lazy-loaded chunk than SheetJS; it is only fetched when
  a spreadsheet is opened, and the weekly maintenance watcher will track the
  package once that gate lands.
