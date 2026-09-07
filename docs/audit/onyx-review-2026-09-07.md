<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors -->

# Upstream onyx security review — 2026-09-07

First execution of the monthly upstream security cherry-pick cadence defined in
`UPSTREAM.md`. The back-port log was empty before this review; no upstream review
had ever been recorded. This review was overdue since approximately 2026-07-25.

## Reviewed range

- **Pinned import (last reviewed commit before this review):**
  `62d6d58d2af7a57f9a5954c611de47f252cb27bd` (upstream v0.16.1, imported 2026-06-25).
  Verified to exist in the upstream repository as a commit object. **VERIFIED-LIVE.**
- **Upstream `main` HEAD reviewed:**
  `9088500eb40c424e76336e83c61b3fd9a5294fc5` — `chore(release): v0.16.4`,
  commit date 2026-08-11T16:34:31-04:00. **VERIFIED-LIVE** (fetched today,
  2026-09-07, from `https://github.com/derekross/onyx` into a temporary clone).
- **Commits since pin: 12.** **VERIFIED-LIVE** (`git log --oneline 62d6d58..origin/main`).

## Method

Full clone of upstream into `%TEMP%\onyx-upstream-review` (outside the Alfred
tree; no git operations were run inside `C:\Users\User\dev\Alfred`). Every commit
in the range was classified for security relevance; the full diffs of the
relevant commits were read, and each relevant code path was searched for in the
Alfred tree to determine applicability. **EXECUTED.**

## Classification table

| Commit | Subject | Classification |
|---|---|---|
| `9088500` | chore(release): v0.16.4 | Not relevant — version-string bump only (4 version files, no dependency changes) |
| `47838dd` | fix: activate the correct tab index when opening a file | Not relevant — UI behavior |
| `8767ff8` | fix: broaden the WebKitGTK DMABUF workaround to all Wayland sessions | Not relevant — Linux display workaround; Alfred targets Windows |
| `15a1d23` | Add MIT license file | Not relevant — upstream licensing housekeeping; Alfred's AGPL relicense is unaffected |
| `260cc72` | chore(release): v0.16.3 | Not relevant — version-string bump only |
| `d17bb6d` | fix: gate the WebKitGTK DMABUF workaround, and wrap long unbroken strings (#28) | Not relevant — Linux display + CSS wrapping |
| `596dc55` | chore: migrate zapstore.yaml to the zsp config format (#27) | Not relevant — distribution config |
| `0ba0788` | chore(release): v0.16.2 | Not relevant — version-string bump only |
| `bdf0063` | Merge PR #26 fix/symlinked-vault-dirs | **RELEVANT — path-IO** (merge of the three commits below) |
| `49e394b` | fix: apply the lexical vault rule to assets and search, cover the linked vault root | **RELEVANT — path-IO** |
| `5d444a6` | fix: operate on the validated path, not the caller's raw string | **RELEVANT — path-IO (validation/use divergence)** |
| `8d6ce5d` | fix: allow opening files inside symlinked vault folders | **RELEVANT — path-IO (containment policy + symlink-cycle protection)** |

No crypto, Nostr signing/encryption, key-handling, deep-link parsing, or
dependency CVE bump commits appear in this range. The three release commits and
`5d444a6`'s `package-lock.json` hunk touch only version strings. **VERIFIED-LIVE**
(diff stats inspected for every commit).

## Per-relevant-commit analysis and Alfred-side applicability

### `8d6ce5d` — fix: allow opening files inside symlinked vault folders (2026-07-29)

**What it does upstream.** Replaces canonicalize-first containment in
`validate_vault_path` with lexical normalization (`.`, `..` resolved without
touching the filesystem; a path that climbs above the vault root is rejected).
A directory symlinked into the vault is treated as an explicit grant and is
followed. Because following links makes the sidebar walk able to cycle
(`Vault/loop -> Vault`), `build_file_tree` now tracks the canonical form of
every directory on the current branch and stops on re-entry, with a depth cap
as a backstop. Tests pin the traversal denials that must survive (`..` escape,
unrelated absolute path, sibling with a shared name prefix).

**Does the code path exist in Alfred? Yes — EXECUTED** (`Select-String` against
`src-tauri\src\lib.rs`):

- Alfred's `validate_vault_path` (line ~182) is the pre-fix canonicalize-first
  version: it canonicalizes the requested path via `canonicalize_lenient` and
  tests `starts_with` against the canonicalized vault.
- Alfred's `build_file_tree` (line ~295) recurses through `item_path.is_dir()`
  — which follows symlinks — with **no cycle detection and no depth cap**.

**Assessment.** Two distinct issues:

1. **Symlink-cycle denial of service — present in Alfred today.** A symlink (or
   junction) loop placed inside the vault causes unbounded recursion in
   `build_file_tree` on the next sidebar refresh, crashing the app (stack
   overflow). Upstream's branch-tracking plus depth cap closes this. This is
   the one genuinely exploitable flaw in the series as far as Alfred is
   concerned: any process able to write into the vault directory can plant the
   loop. Severity is local-DoS, not data exposure.
2. **Containment-policy divergence — Alfred is stricter than upstream, not
   weaker.** Alfred's canonicalize-first rule denies all symlinked vault
   folders; upstream deliberately relaxed this to follow in-vault links as an
   explicit grant. Alfred is not less secure here. Whether to adopt upstream's
   relaxed policy is a product decision, not a security back-port — and it
   interacts with Alfred's own Phase-2+ vault scaffold, so it needs Martin's
   sign-off, not a mechanical cherry-pick.

**Proposed back-port entry.** Port only the cycle protection from this commit
(canonical-path tracking on the current branch of `build_file_tree`, plus a
depth cap) while retaining Alfred's canonicalize-first containment. Do not
adopt the lexical containment relaxation without a decision record.

### `5d444a6` — fix: operate on the validated path, not the caller's raw string (2026-07-29)

**What it does upstream.** `validate_vault_path` returns a normalized
`PathBuf`, but all 12 command call sites discarded it and passed the original
caller-supplied string to the filesystem, letting validation and use diverge.
The commit adopts the returned path at every call site. Upstream explicitly
notes this does **not** close the dangling-symlink write escape (their F1);
that was ruled intentional (write-through on a symlinked note) and is pinned
by test in `49e394b`.

**Does the code path exist in Alfred? Yes — EXECUTED.** Alfred's call sites
(e.g. `read_file` line ~357, `write_file` line ~365, `write_binary_file`
line ~373, and the rename/copy/duplicate/delete handlers around lines
467–490) all call `validate_vault_path(&path, &vault)?;`, discard the returned
`PathBuf`, and then act on the raw caller string (`fs::read_to_string(&path)`,
`fs::write(&path, ...)`). This is byte-for-byte the pre-fix upstream pattern.

**Assessment.** Applicable, with a caveat. In Alfred's canonicalize-first
model the practical divergence window is narrower than upstream's post-8d6ce5d
lexical model, but it is not zero: `canonicalize_lenient` validates a
normalized form for paths that do not fully exist yet, while `fs::` then acts
on the raw spelling — the same validate-one-path/use-another smell upstream
fixed. The fix is cheap, purely defensive, and independent of the
containment-policy question above.

**Proposed back-port entry.** Port this commit directly: make all command call
sites use the `PathBuf` returned by `validate_vault_path`. Also port the added
tests. If the cycle-protection-only variant of `8d6ce5d` is taken, this commit
applies cleanly on top of Alfred's existing canonicalize-first validation.

### `49e394b` — fix: apply the lexical vault rule to assets and search, cover the linked vault root (2026-07-29)

**What it does upstream.** Moves the `asset:` custom protocol handler off its
private `canonicalize()` + `starts_with` copy onto `validate_vault_path`, and
removes its `decoded_path.contains("..")` string check (which 403'd legitimate
filenames like `screenshot..final.png`). Replaces `get_configured_vault`
(canonicalizing) with `get_configured_vault_setting` (unresolved spelling) so
search works when the vault itself is behind a symlink, and adds the canonical
form as a second allowed root. Also applies the depth-32 cap to search with a
logged count of pruned directories.

**Does the code path exist in Alfred? Yes — EXECUTED.** Alfred's `asset:`
protocol handler (line ~1189) carries exactly the pre-fix code: the
`contains("..")` string rejection, its own canonicalize + `starts_with`
containment against `get_configured_vault` and the config dir. Alfred's
`search_files` (line ~630) canonicalizes the search root and tests
`starts_with` against the canonicalized configured vault — the old rule.
Alfred's `WalkDir` search does not follow links, so it is not exposed to
search-side cycles, but it silently skips linked folders.

**Assessment.** Partially applicable. The `contains("..")` false positive and
the duplicated containment logic exist in Alfred verbatim and are worth
fixing. The "vault behind a symlink" half of the commit only matters if Alfred
adopts upstream's relaxed symlink policy (see `8d6ce5d`); under Alfred's
current canonicalize-first rule a symlinked vault root already canonicalizes
to itself on both sides. The search depth cap is inert in Alfred today because
Alfred's `WalkDir` never follows links; port it only if follow_links is ever
enabled.

**Proposed back-port entry.** Port the `asset:` handler refactor (route it
through Alfred's `validate_vault_path`, drop the `contains("..")` string
check — lexical/canonical normalization already handles traversal correctly).
Defer the `get_configured_vault_setting` split and the search depth cap until
the symlink-policy decision is made.

## Proposed back-port log entries (for Martin to execute — cherry-picks are out of scope for this review)

| # | Upstream SHA | Fixes | Suggested Alfred-side change | Status |
|---|---|---|---|---|
| 1 | `8d6ce5d7e31856f972441eab79251553cd53217a` (partial) | Symlink-cycle DoS in the sidebar tree walk (`Vault/loop -> Vault` crashes the app) | Add canonical-path branch tracking + depth cap to `build_file_tree` in `src-tauri/src/lib.rs`; keep canonicalize-first containment. Do NOT adopt the lexical symlink-grant policy without a decision record | Proposed |
| 2 | `5d444a684bb0d25264fd790f45cfe10cd49d0a99` | Validate/use divergence: commands validate the normalized path but act on the caller's raw string | Adopt the returned `PathBuf` from `validate_vault_path` at all command call sites; port the added traversal tests | Proposed |
| 3 | `49e394bb8aa45c29396251569b7b9f7799e8fc6c` (partial) | `asset:` handler duplicate containment + `contains("..")` false positive (403s legal names like `screenshot..final.png`) | Route the `asset:` handler through Alfred's `validate_vault_path`; remove the string check. Defer the symlinked-vault-root and search-depth-cap halves pending the policy decision | Proposed |

**Note on divergence.** Upstream's fixes land entirely in `src-tauri/src/lib.rs`,
which Alfred still shares with upstream in structure, so conceptual porting is
straightforward, but a literal `git cherry-pick` will conflict (Alfred's file
carries Alfred-only additions such as the `alfred://` deep-link handler and the
config-dir allowance). These should be manual ports guided by the upstream
diffs. Alfred's frontend divergence (Nostrify/Soapbox removal, OpenCode/OpenClaw
deletion, provider denylist) does not intersect this range at all — no relevant
upstream commit touches the Nostr stack, AI providers, or key handling.

## Proposed "last reviewed commit" for UPSTREAM.md

`9088500eb40c424e76336e83c61b3fd9a5294fc5` (upstream `main` HEAD, v0.16.4,
2026-08-11), recorded as reviewed on 2026-09-07. **VERIFIED-LIVE.**

## Labels used

- **VERIFIED-LIVE** — network-fetched from `github.com/derekross/onyx` today.
- **EXECUTED** — a check run locally against the Alfred tree during this review.
- **UNVERIFIED** — asserted but not checked this session. (No claims in this
  document are UNVERIFIED.)
