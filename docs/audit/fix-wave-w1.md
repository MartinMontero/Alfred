# Fix-wave W1 (#1 + #3) + identity pass — execution audit

**Date:** 2026-07-14. **Authority:** master operator word (ruling B lineage). **Commits:**
`57f4ca7` (#3), `7270f33` (#1), `1853ac5` (identity art/icons). Copy-reframe drafts staged
uncommitted, awaiting the builder's word.

## Red-first evidence (acceptance per ruling B — red BEFORE the fix, green after)

**RED (a) — today's editor path, headless, same remark engine Milkdown bundles:**
```
input : ---\nid: note-1\nconfidence: 0.9\n---\n\nbody\n
output: "***\n\nid: note-1\nconfidence: 0.9\n--------"
starts with ---: false
```
The fence became `***` and the closing fence a long-dash setext line — byte-for-byte the field
capture from the laptop (`badge test.md`, bytes 42,42,42, 18-dash line).

**RED (b) — verbatim pre-fix apply logic on a displaced-fence note (vitest, guard disabled):**
```
× displaced block: refuses to write and flags, instead of prepending a second fence
AssertionError: expected false to be true
pre-fix output: "---\nid: stable-1\n---\n\n# Title above the fence\n---\nid: x\n---\nbody"
fence lines now: 4 (was 2; stacking confirmed)
Tests  1 failed | 7 passed (8)
```

**GREEN — guard restored, full acceptance:** `8 passed (8)`; whole suite
**273 passed | 4 platform skips** (was 265|4); typecheck + desktop build clean.

## What landed

- **#3:** `splitFrontmatter`/`joinFrontmatter` (byte-exact incl. CRLF/trailing-newline shapes);
  Editor holds the fence outside Milkdown and re-joins on serialize; doc-swap path splits too;
  NEW `props.content` watcher (the editor only watched `filePath` — outside edits were clobbered
  by the stale buffer on the next keystroke = the observed flash-then-revert; frontmatter-only
  edits now update the held fence without touching the document). `applyPropertiesToContent`
  extracted + hardened: displaced blocks flag instead of stacking; prepend remains only for
  notes with no frontmatter anywhere. Panel shows a plain-language warning.
- **#1:** step-named failures in `createNewVault` (never a bare "failed"; DEV `[vault-create]`
  trace = the accepted instrument); `set_vault_scope` rejection now renders a visible banner
  (reason + path + Retry + choose-different-folder) instead of an empty shell. Laptop J1 repro
  with DEV console open remains the closing evidence for which candidate fired in the field.
- **Identity:** full icon regeneration from the verified mark (1024² RGBA, corners alpha-0,
  51% transparent); `onyx-rock.svg` deleted (zero references — last Onyx image in the icon
  tree); welcome art = the raster mark (violet-glow SVG retired with it); rocket/mascot glyphs
  dropped from benefit rows. Small-size illegibility (32/16px) logged as accepted-for-beta.

## Race hypothesis disposition

The flash-then-revert mechanism was IDENTIFIED IN SOURCE during the wave (editor watched only
`filePath`; Properties edits never reached the live document; any keystroke re-asserted the
stale buffer). The #3 wiring removes the frontmatter-clobber class outright and syncs external
body changes in place. The planned ring-buffer trace was therefore not needed for this wave;
if the laptop walk still shows a revert, the trace ships as designed in the proposal.

## Ledger corrections

- **A7/A8 were never lost:** `git log -S` shows A7 landed in `d1d96e3` (Stage A) and the
  AGENTS.md sync in `7b2731c`; README:36 already links goose-docs.ai. The LOOP.md
  "WORKING-TREE EDIT, not committed" line was stale. W3's A7/A8 item is closed by history —
  no re-stage, no commit word needed.
