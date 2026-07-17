# 0005 — Evidence frontmatter fields, bands, and the two-layer rule

- **Status:** Accepted (Martin, 2026-07-14 — ratification word given this date; the design
  session drafted the fields 2026-07-13 with acceptance pending)
- **Context:** Triad canon requires evidence provenance to attach to notes as frontmatter, with
  confidence, validity windows, and non-destructive invalidation. Field names and thresholds needed
  canonization before any UI reads them (renames get expensive once notes carry them).
- **Decision:** Notes MAY carry these optional fields (absence = unmarked; the load-bearing schema
  in `src/lib/agentic/frontmatter-schema.ts` is unchanged and does not require them):
  - `confidence` — number in [0, 1]. Out-of-range or non-numeric values are surfaced as issues and
    rendered as *unrated*; never clamped, never guessed.
  - `sources` — list of strings.
  - `valid-from`, `valid-until` — ISO dates (YYYY-MM-DD). A claim past `valid-until` is expired,
    inclusive of the end date.
  - `directional` — boolean; estimate/direction-of-truth marker.
  - `needs-caveat` — boolean; true when the claim must not travel without its caveat.
  - `invalidated` — reason string (preferred) or bare `true`. Invalidation is a visible label;
    content is never hidden or deleted.
- **Bands:** high ≥ 0.75, mid ≥ 0.40, low < 0.40, unknown when confidence is absent/invalid.
- **Two-layer rule:** the build-workflow vocabulary (EXECUTED / VERIFIED-LIVE / CANON / REPORTED /
  UNVERIFIED) is for loop reports and audits only; it never appears in product UI. Product UI speaks
  bands, flags, windows, invalidation.
- **Implementation:** `src/lib/evidence.ts` (pure parser, unit-tested), `EvidenceBadge.tsx`
  (glyph + text label, never color alone; unmarked renders nothing), mounted in the Properties panel.
- **Consequences:** other surfaces (editor gutter, search results, graph) can adopt the badge
  without re-deciding semantics; migrating field names later requires a vault migration, so changes
  to this decision need a superseding ADR.
