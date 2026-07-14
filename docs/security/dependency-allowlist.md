# Dependency vulnerability allowlist

**Adjudication record (the ruling of record):** `docs/audit/stage-d-vulnerability-decision.md`
(2026-07-13) — full reachability adjudication of every finding at `224e624`, rulings table,
corrections log. THIS file is the operational allowlist that implements those rulings: live
entries, triggers, review dates. One source, one pointer — the ID list lives in these two
documents only (adjudication + operational); scanner configs reference, never re-argue.

**Policy.** The default state of this file is EMPTY. Every entry here is a documented exception
carrying three mandatory parts: **proof** (why the vulnerable code path is unreachable or the
impact class is acceptable), **triggers** (concrete events that force re-evaluation before the
review date), and a **review date** (time-boxed; an expired entry is treated as a failing gate).
An entry may never be added merely to make CI pass. Suppressing any advisory is a stop-and-ask
under the constitution; every entry below records the builder's authorization.

**Authorized:** 2026-07-14, builder verdict (Gate D): "Option B (documented allowlist) for
quick-xml ×2 and uuid — with per-finding proof and triggers. Take the safe fix for @babel/core.
Log-and-move the unmaintained/unsound warnings. No Tauri bump." Final ruling same day: the
allowlist contains **exactly three IDs** — RUSTSEC-2026-0194, RUSTSEC-2026-0195,
GHSA-w5hq-g745-h8pq. rustls-webpki was ruled **A: fix, never ignore** (see the resolved section
below). Decision record: `LOOP.md` — "GATE D VERDICT (2026-07-14)".

**Verification basis:** cargo-audit 0.22.2 with the advisory DB fetched 2026-07-14, run against
`src-tauri/Cargo.lock` at HEAD `224e624`; `npm audit` against `package-lock.json` same commit;
reverse-dependency trees via `cargo tree -i`.

---

## Active allowlist entries

### 1–2. RUSTSEC-2026-0194 + RUSTSEC-2026-0195 — quick-xml 0.37.5 (in the Windows artifact)

- **Advisories:** 0194 "Quadratic run time when checking a start tag for duplicate attribute
  names"; 0195 "Unbounded namespace-declaration allocation in `NsReader`". Both
  CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/**C:N/I:N/A:H** — denial-of-service only, no confidentiality
  or integrity impact. Patched only in quick-xml **>= 0.41.0**. No GHSA aliases exist (RustSec
  IDs only), so Grype/GHSA-based scanners do not carry them; cargo-audit is the enforcement
  point.
- **Where it sits:** `tauri-winrt-notification 0.7.2` ← `notify-rust 4.11.7` ←
  `tauri-plugin-notification 2.3.3` ← alfred. This copy IS compiled into the shipped Windows
  `.exe`.
- **Proof of non-reachability as vulnerable:** both flaws live in quick-xml's XML **parsing**
  path (duplicate-attribute checking while reading start tags; namespace-declaration allocation
  in `NsReader`). `tauri-winrt-notification` uses quick-xml to **write** Windows toast XML that
  it assembles itself from Alfred's own notification strings. Alfred parses no untrusted XML in
  Rust — there is no code path by which attacker-controlled XML reaches a quick-xml reader in
  the shipped artifact. Residual worst case if the analysis were wrong is CPU/memory exhaustion
  (DoS), not data exposure.
- **Why not fixed instead:** the patch requires quick-xml >= 0.41.0; `tauri-winrt-notification`
  pins `^0.37`. No released upstream version consumes 0.41 yet; forcing it would mean forking a
  transitive dependency — disproportionate for a DoS-only, parse-side finding on a write-only
  usage.
- **Triggers (any one forces action before the review date):**
  1. `notify-rust` / `tauri-winrt-notification` (or the Tauri notification plugin) releases with
     quick-xml >= 0.41 — take the update immediately via `cargo update`.
  2. Any Alfred change introduces parsing of externally-sourced XML in Rust.
  3. Either advisory is reclassified beyond denial-of-service.
- **Review date:** 2026-10-14, or the Stage E release gate, whichever comes first.
- **Decision record:** `LOOP.md` — "GATE D VERDICT (2026-07-14)".

### 3–4. RUSTSEC-2026-0194 + RUSTSEC-2026-0195 — quick-xml 0.38.4 (not in the shipped artifact)

- **Where it sits:** `wayland-scanner 0.31.8` (build-time proc-macro) ← wayland-client/protocols
  ← `wl-clipboard-rs` ← `arboard` ← `tauri-plugin-clipboard-manager 2.3.2` ← alfred. This is the
  **Linux Wayland clipboard** subtree.
- **Proof:** Alfred's build target is `x86_64-pc-windows-msvc` (native Windows 11); the Wayland
  subtree is not compiled into the shipped artifact at all (`cargo tree -i quick-xml@0.38.4`
  prints nothing on the default/Windows target — it appears only under `--target all`). Even in
  a Linux dev build, `wayland-scanner` parses the **vendored Wayland protocol XML files bundled
  with the crate at build time**, never runtime attacker input.
- **Triggers:** (1) Alfred ever ships a Linux target (re-evaluate before any such build);
  (2) same reclassification trigger as above.
- **Review date:** 2026-10-14, or the Stage E release gate, whichever comes first.
- **Decision record:** `LOOP.md` — "GATE D VERDICT (2026-07-14)".

### 5. GHSA-w5hq-g745-h8pq — npm `uuid` 8.3.2 via `exceljs` 4.4.0 (moderate)

- **Advisory:** "Missing buffer bounds check in v3/v5/v6 when buf is provided"; affected
  < 11.1.1. Flagged pair: `exceljs >= 3.5.0` (depends on vulnerable uuid) + `uuid < 11.1.1`.
- **Proof of non-reachability:** the flaw requires a caller to invoke uuid **v3/v5/v6 passing a
  `buf` argument**. exceljs's entire uuid usage is one file,
  `lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`, which calls **`uuidv4()` with zero
  arguments** (lines 43 and 77) — v4 is not in the affected function set, and no buffer is ever
  passed. Those call sites are on the xlsx **serialization** (write) path (conditional-formatting
  x14 IDs); Alfred uses exceljs exclusively as a **read-only viewer**
  (`src/components/XlsxViewer.tsx` — lazy-loaded, parse only, no write/export path). Alfred's
  own direct `uuid` is 13.0.2 (also deduped into vis-data/vis-network), which is unaffected.
- **Why not fixed instead:** npm's only offered remediation is a **breaking downgrade** to
  exceljs 3.4.0 (pre-vulnerable-uuid era, semver-major regression) — rejected; exceljs 4.4.0 is
  the registry-published replacement for the excluded CDN xlsx dependency and has no newer
  release with uuid >= 11.1.1.
- **Gate impact:** `npm audit` is not a blocking CI gate; Grype blocks at high/critical and this
  is moderate, so `.grype.yaml` stays empty (its documented default). This entry exists so the
  finding is on the record with proof, not because a gate needed silencing.
- **Triggers:** (1) any exceljs release depending on uuid >= 11.1.1 — upgrade instead of
  allowlist; (2) Alfred adds ANY xlsx write/export feature (the uuid call sites become live
  code); (3) severity reclassification to high or above (would then trip Grype — add a
  documented `.grype.yaml` entry or fix, builder's word required again).
- **Review date:** 2026-10-14, or the Stage E release gate, whichever comes first.
- **Decision record:** `LOOP.md` — "GATE D VERDICT (2026-07-14)".

---

## Fixed this pass (not allowlisted)

- **GHSA-4x5r-pxfx-6jf8 — @babel/core <= 7.29.0** (low; arbitrary file read via
  sourceMappingURL comment): fixed by `npm audit fix` → @babel/core **7.29.7**
  (transitive, via vite-plugin-pwa → workbox-build). Lockfile-only change; typecheck and the
  full Vitest suite pass after the bump.

## RESOLVED — rustls-webpki 0.101.7: ruling A, FIXED, never allowlisted (2026-07-14)

**Confirm-then-close FAILED confirmation, so the builder ruled A: targeted fix.** The premise
"already patched at `224e624`" did not hold: cargo-audit (fresh DB, 2026-07-14) flagged all three
at the pinned 0.101.7 —

| Advisory | Alias | Title | Patched in |
|---|---|---|---|
| RUSTSEC-2026-0098 | GHSA-965h-392x-2mh5 | Name constraints for URI names incorrectly accepted | >= 0.103.12 |
| RUSTSEC-2026-0099 | GHSA-xgp8-3hg3-c2mh | Name constraints accepted for wildcard-name certificates | >= 0.103.12 |
| RUSTSEC-2026-0104 | GHSA-82j2-j2ch-gfr8 | Reachable panic in certificate revocation list parsing | >= 0.103.13 |

**The path was live TLS:** rustls-webpki ← rustls 0.21.12 ← reqwest 0.11.27 ← Alfred's own
`custom_provider_request` / streaming / `list_models` commands (`src-tauri/src/lib.rs:907,945,991`)
— certificate validation for user-configured AI provider endpoints. reqwest is Alfred's direct
dependency, not part of the Tauri crate graph, so this was never a Tauri bump.

**Fix taken (ruling A):** `reqwest 0.11.27 → 0.12.28` in `src-tauri/Cargo.toml`, features
unchanged (`stream`, `rustls-tls`) — pulls rustls 0.23 + rustls-webpki >= 0.103.13 and removes
the unmaintained `rustls-pemfile 1.0.4` warning. Proof standard: before/after
`cargo tree -i rustls-webpki` (after must show ONLY >= 0.103.13) and `cargo tree -i rustls`
(no 0.21.x anywhere); cargo-audit zero vulnerabilities. **These three IDs are deliberately NOT
in any ignore list** — an ignore on a fixed item would mask a regression; if a vulnerable
webpki ever re-enters the lockfile, the cargo-audit gate goes red. Decision record: `LOOP.md` —
"GATE D VERDICT (2026-07-14)".

## Informational advisories — logged, non-blocking (22 after the reqwest bump, 2026-07-14)

Reported by CI on every run; they do not block (constitution: block on real vulnerabilities,
report the rest). Reviewed on the monthly upstream-security cadence (docs/release-process.md).
Was 23 before ruling A; the reqwest 0.11→0.12 bump removed `rustls-pemfile 1.0.4`
(RUSTSEC-2025-0134, unmaintained) from the tree entirely.

- **unmaintained (17):** the GTK3 family `atk`, `atk-sys`, `gdk`, `gdk-sys`, `gdkwayland-sys`,
  `gdkx11`, `gdkx11-sys`, `gtk`, `gtk-sys`, `gtk3-macros` (all 0.18.2 — Linux-GTK subtree, not
  in the Windows artifact); `fxhash 0.2.1`; `proc-macro-error 1.0.4` (build-time);
  `unic-char-property`, `unic-char-range`, `unic-common`, `unic-ucd-ident`, `unic-ucd-version`
  (0.9.0).
- **unsound (5):** `anyhow 1.0.100` (RUSTSEC-2026-0190); `glib 0.18.5` (RUSTSEC-2024-0429,
  Linux-GTK); `rand 0.7.3` / `0.8.5` / `0.9.2` (RUSTSEC-2026-0097, three duplicate lockfile
  entries).
