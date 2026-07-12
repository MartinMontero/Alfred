# Alfred threat model (STRIDE skeleton)

**Status:** living document; started 2026-07-12 (open-beta loop, Stage A). Each surface gets
S/T/R/I/D/E rows filled as stages touch it; unfilled rows are open work, not absent threats.
Scope: the desktop app (Tauri, Windows), the PWA build, the Alfred MCP server, the goose sidecar
channel, the skills/recipes channel, telemetry, and credential storage.

## Assets
A1 vault contents (notes, specs, memory bank — the user's mind). A2 Nostr keys. A3 AI provider
keys. A4 telemetry store (metadata only by design). A5 goose config/permission files (integrity =
the safety model). A6 the user's machine (shell reachable via goose developer__shell).

## Surface 1 — Vault (filesystem + editor)
- **T (tampering):** notes are plaintext markdown on disk; any local process can modify them —
  including planting prompt-injection text an agent will later read. Mitigations: OS user
  boundary; recipe/skill sanitization closes the *invisible*-payload channel; MCP provenance
  stamps mark agent-written memory. Residual: visible-language injection in notes (accepted;
  consent + tool gate are the control).
- **I (info disclosure):** NIP-44 encryption applies before relay sync only; local-at-rest is the
  OS boundary (stated honestly in docs; full-disk encryption is the user's control).

## Surface 2 — Alfred MCP server (`mcp/`)
- **E (elevation):** path traversal → `vault-fs.ts` confinement (both-separator `..`, absolute,
  UNC, drive-letter rejected; resolved-containment check). Proven: `mcp/server.test.ts`,
  `mcp/vault-fs.test.ts`.
- **S (spoofing)/T:** stdio-only by default; opt-in HTTP is loopback-bound with DNS-rebinding
  protection and pinned hosts/origins (`mcp/transport.ts`).
- **T (memory poisoning):** agent writes to the memory bank carry provenance stamps
  (`<!-- provenance: mcp ... -->`); Step-7 review gate (Phase 5, open) adds human review before
  promotion.
- Packaging risk: server currently launches via `npx tsx` — on a stranger's machine that path
  does not exist → bundling is Stage-E work (E5), a reliability/integrity issue (running arbitrary
  resolved tsx from PATH is also a supply-chain surface).

## Surface 3 — ACP ↔ goose (the harness channel)
- **FINDING (2026-07-12, STEP-0 item 4) — title-keyed permission enforcement, spoofable:**
  `classifyToolCall` (src/lib/goose/tool-gate.ts:80-86) auto-allows when the ACP
  `ToolCall.title`/`kind` — **agent-authored display metadata** — exactly matches a read-tool
  id/registered title with a non-mutating kind, and GoosePanel.tsx:141 uses that decision to
  **answer `requestPermission` with an allow**. goose (approve mode) prompts for every tool not in
  `always_allow`; a tool able to present `title: "read a note"` (or `alfred-vault__vault_read`)
  with a benign `kind` would be silently approved — including a write-capable tool from any
  extension present in the session. The goose-side `permission.yaml` layer keys on stable
  namespaced `(extension__tool_name)` ids and is NOT affected; the default no-handler path is
  deny. **Exploitability today** is bounded by the curated config (only `alfred-vault` +
  goose built-ins in the generated config.yaml) but the pattern is a standing bug.
  **Fix options (decision owed at Gate A):**
  (a) delete the Alfred-side auto-allow entirely — reads never reach `requestPermission` (the
      goose-side `always_allow` short-circuits first), so the path costs nothing in the normal
      flow; title becomes display-only (labeled untrusted);
  (b) key the gate on a verifiable stable identity if ACP carries one (investigate
      `ToolCallUpdate` raw fields in Stage B) and fall back to (a) where it doesn't.
  Either way: title used for enforcement is over; title-as-observability stays acceptable if
  labeled heuristic-only.
  **Decision (2026-07-12, builder): option (a) accepted** — remove the Alfred-side auto-allow;
  every goose permission request is surfaced to the human; title becomes display-only.
  Implemented in Stage B; option (b) (verifiable-id keying) remains a Stage-B investigation for
  UX, never a substitute for (a)'s deny-by-default.
- **Process lifecycle:** orphan prevention = JS close hooks + Windows Job Object
  kill-on-job-close (`job_guard.rs`; degrades gracefully with a warning if job assignment is
  refused). Capabilities pin sidecar spawn/execute to `binaries/goose` with `acp` / recipe args
  only (`capabilities/default.json`).
- **D (DoS):** a wedged goose blocks the panel, not the app; timeouts on initialize.

## Surface 4 — Skills/recipes channel
Recipes: guarded (sanitizer + AST scan + preview + clean-tree staging; Phase 5 Step 1).
Skills: **no ingestion path exists in the tree today**; ADR-0003 defines the three locks required
before one may exist (scan incl. Tags block + decode-before-match, install consent, active-skill
visibility + session-start re-scan). Honesty boundary: scanning cannot catch semantic injection —
locks close the obfuscated/silent channels only; consent + tool gate carry the rest.

## Surface 5 — Provider denylist (Meta/OpenAI/xAI)
**Stated honestly: default-safe, not tamper-proof.** The denylist is enforced at Alfred's own
chokepoints (`provider-policy.ts` via `tauri/ai.ts` for Direct Chat; `provider-lockdown.ts` env +
generated config + ACP provider filtering for goose). It is **bypassable by a determined user**:
goose supports custom OpenAI-compatible providers with arbitrary `base_url`, and a user editing
the isolated goose config.yaml by hand (or setting env vars in goose's process some other way)
can reach an excluded host. We do not claim "unreachable"; we claim "never by Alfred's doing, and
warned when detected." **Stage-B unit (B5):** startup scan of the generated goose config +
custom-provider entries for excluded hosts → surface a warning, never silently rewrite.

## Surface 6 — Telemetry
Born-redacted by construction: typed allowlist events, no free-text columns; opt-in, off by
default, deny-by-default re-check server-side; honest wipe (WAL-checkpointed); byte-scan canary
(`telemetry_tests.rs`) proves no note bodies/secrets reach disk bytes. Residual: correlation ids
exist by design (trace columns) — documented in the privacy policy (G3); local-only, no
transmitter exists in the tree.

## Surface 7 — Credential storage
Desktop: OS keyring via Tauri; **documented fallback** — when the secret store is locked/
unavailable, Direct-Chat key reads fall back to (and writes land in) plaintext localStorage
(`ai-credentials.ts`), preserved to avoid data loss. Finding F-3: surface a Settings warning when
the fallback is active (Stage-B candidate). goose keys: env-only into the sidecar process
(`GOOSE_DISABLE_KEYRING=1`); ambient excluded-vendor key env vars are blanked before spawn.
Nostr keys: keyring service `dev.wecanjustbuildthings.alfred` — key backup/export ceremony is G3
work (keyring loss = key loss without it).

## Surface 8 — Dual-build PWA delta
The web build has: no sidecar, no MCP, no Rust telemetry, no OS keyring — secrets live in a
passphrase-sealed browser store; agentic surfaces are compiled out or gated (`!isWeb()`), and the
AI adapter is a loud-reject stub. **The PWA is a notes/reader client, not an agentic host**, and
must say so in-product (F3 delta notice — does not exist yet). Never imply keyring-grade storage
in a browser. Browser-specific threats (XSS in rendered markdown → `security.ts` sanitizers;
storage eviction; shared-machine risk) get their STRIDE pass in Stage F.

## Standing rules
- Every new surface gets a row here before it ships (gate item).
- Any claim of "blocked/unreachable" in docs must cite the enforcing code + test, or be reworded
  to "refused at Alfred's chokepoints".
