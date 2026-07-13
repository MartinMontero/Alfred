# 0004 — In-app AI chat (CustomProviderChat): keep or cut

**Status:** Accepted (2026-07-12) — builder verdict: **KEEP, reframed per Option A** ("Direct
Chat — non-agentic"); conditions 1–4 below are binding and execute in Stages B/G.
**Decider:** builder (Martin Montero).
**Phase:** drafted in the open-beta loop, Stage A (STEP-0 item 9 classification). Executed in
Stage G per the decision here.

## Classification (from source, 2026-07-12)

`src/components/CustomProviderChat.tsx` (+ `src/platform/tauri/ai.ts`, `src/platform/web/ai.ts`,
`src/lib/ai-credentials.ts`) is the **Onyx in-app-chat remnant, generalized and hardened** — not
goose plumbing:

- A chat panel speaking the OpenAI **wire format** (`POST /v1/chat/completions`) to any
  user-configured endpoint: Ollama, LM Studio, vLLM, MapleAI proxy, etc. Desktop-only
  (`!isWeb() && !isMobileApp()`), reachable via toolbar + Settings section "Custom Provider"
  (App.tsx:3009/3033).
- **Hardened in Phase 1:** every request passes `assertProviderAllowed` (the denylist chokepoint)
  in `src/platform/tauri/ai.ts` before leaving the machine — Meta/OpenAI/xAI endpoints and model
  ids are refused; "OpenAI-compatible" is a wire format, not a vendor, and the policy distinguishes
  the two (`provider-policy.ts` + false-positive suite).
- API key lives in the OS secret store (`ai-credentials.ts`) with a documented plaintext
  localStorage fallback when the store is locked (threat model §keyring).
- Web build: loud-reject stubs — no silent degradation.
- It is a **separate AI path from goose**: direct HTTP request/stream via Rust commands, no ACP,
  no tools, no vault writes (context injection of the current file only).

This contradicts the one-liner "AI = goose over ACP" — hence this ADR.

## Recommendation: KEEP, reframed honestly (Option A)

Keep the subsystem, renamed/labeled in UI and docs as **"Direct Chat — non-agentic"**:

- It is the natural zero-config onboarding path (G1): a detected local Ollama gives a working AI
  experience with no key, no spend, no sidecar, no MCP — the cheapest possible first success for
  a non-coder.
- It is the lightweight surface for trivial Q&A where launching the goose harness (sidecar +
  permission ceremony) is overkill.
- The denylist chokepoint is already enforced here; cutting it removes working, tested policy
  surface without reducing attack surface materially (the Rust HTTP commands would go with it).

Conditions attached to KEEP:
1. UI copy states plainly: no tools, no vault writes, messages go directly to the configured
   endpoint (which the user chose), nothing agentic.
2. The provider picker enforces the denylist visibly (it does at request time today; G1 adds it
   at entry time).
3. The localStorage-fallback caveat is surfaced in Settings when active (finding F-3).
4. "AI = goose over ACP" is rewritten wherever it appears as: "**Agentic** AI = goose over ACP;
   Direct Chat is a non-agentic convenience surface."

## Option B: CUT

Remove CustomProviderChat + the three Rust `custom_provider_*` commands + Settings section +
ai-credentials custom-provider key. Consequences: single AI surface (conceptual clarity); G1
zero-config path must then be built through goose-with-Ollama instead (heavier first-run:
sidecar + config + permission ceremony before first token); ~900 lines removed; the Onyx-remnant
question is closed permanently.

## Consequences of deciding late

G1 (onboarding) and G2 (residue purge) both build on this decision; it must be Accepted (either
direction) at Gate A or Gate B to keep Stage G unblocked.
