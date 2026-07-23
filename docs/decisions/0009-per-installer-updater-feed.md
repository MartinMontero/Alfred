# 0009 — The updater feed carries per-installer keys, authored by our own lane

- Status: Proposed
- Date: 2026-07-22
- References: beta.2→beta.3 installed-update defect (forensics 2026-07-22);
  tauri-plugin-updater `updater-v2.10.1` source; tauri-action v0.5.20 source;
  Tauri v2 updater docs (static JSON schema, custom targets).

## The defect this answers

The installed beta.2 (NSIS, per-user, `%LOCALAPPDATA%\Alfred`) offered 0.1.2,
downloaded it, and stayed at 0.1.1. Root cause, proven from pinned sources:

- The feed's only key, `windows-x86_64`, pointed at the **.msi** — because
  tauri-action (v0.5.20) picks one signature by priority and prefers
  `.msi.sig` over `.exe.sig` unless `updaterJsonPreferNsis` is set
  (`src/upload-version-json.ts:124-141`; the TODO to flip the default for v2
  apps is unimplemented at our pinned SHA).
- The plugin probes `{os}-{arch}-{installer}` **first**, then `{os}-{arch}`
  (`updater.rs:578-587`; suffixes `nsis`/`msi` at `:65-66`) — our NSIS
  installs asked for `windows-x86_64-nsis`, found nothing, fell back to the
  MSI entry.
- The plugin has **no installed-type check** on Windows: it content-sniffs
  the download and runs `msiexec /i … /passive` blind (`updater.rs:787-926`),
  with no `ALLUSERS` override — scope comes from the MSI itself (WiX default
  per-machine). Nothing touches the per-user NSIS copy; `ShellExecuteW`'s
  result is ignored and the app exits regardless (`updater.rs:854-865`).

## Decision

1. **The release lane authors `latest.json` itself** (`scripts/updater-feed.mjs
   build`), replacing tauri-action's asset, with three platform keys built
   from THIS run's artifacts:
   - `windows-x86_64-nsis` → `Alfred_<v>_x64-setup.exe` + its `.exe.sig`
   - `windows-x86_64-msi` → `Alfred_<v>_x64_en-US.msi` + its `.msi.sig`
   - `windows-x86_64` (fallback for installs whose bundle-type detection
     fails) → the NSIS entry, because every real install is NSIS (the install
     guide links only `-setup.exe`).
   NSIS→NSIS updates preserve the per-user install (`/UPDATE` flag);
   MSI→MSI upgrades in place per-machine. Authoring from scratch also kills
   tauri-action's stale-merge behavior (it preserves platform entries from a
   pre-existing `latest.json`).
2. **A hard regression gate in the lane** (`scripts/updater-feed.mjs verify`)
   downloads the feed BACK off the release and fails unless: the nsis key
   (and the fallback) point at this tag's `-setup.exe`, the msi key at this
   tag's `.msi`, every signature matches the local `.sig` bytes, the version
   matches the manifests, and **no platform url escapes this tag** (the
   stale-merge catch). Unit tests pin the gate against the literal shipped
   beta.3 shape (`src/lib/updater-feed.test.ts`).

## Consequences

- beta.3 → beta.4 and onward self-update correctly for NSIS installs; MSI
  installs (if any ever exist) update via their own key.
- The live beta.3 feed still carries the MSI-only shape; the one-hop remedy
  for beta.2 users is a manual `-setup.exe` install (known-issues.md).
- The lane owns the feed contract; tauri-action remains the builder/signer
  and draft creator only.
