# 0008 — Adopt the compiled holmes-guard policy layer; retire the TypeScript one

**Status:** Accepted (2026-07-22) — ratified by Martin's merge of the Track-1 PR (#21, merge `b4c11c6`), per the rule recorded at proposal time.
**Decider:** builder (Martin Montero).
**Context:** Alfred × Holmes integration brief, Stage 1, Track 1 (`alfred-holmes-integration-brief.md`,
repo root); Holmes cross-repo obligation "`holmes-guard` adoption retiring `provider-lockdown.ts`".
Holmes pinned at `63f877a7399bee0d34b10fed08e35e87a434cd73` (main, 2026-07-20).

## Decision

1. Add `holmes-guard` and `holmes-core` as git dependencies pinned to the full commit SHA above
   (never a bare branch reference; re-pin to the Holmes RC tag, when cut, in its own commit).
   Dependency screen executed 2026-07-22: the two crates add **zero third-party packages** to
   `Cargo.lock`; both are AGPL-3.0-or-later — no license seam.
2. **The compiled crate replaces the TypeScript policy layer.** `src/lib/provider-lockdown.ts` is
   deleted — deleted, not deprecated: policy that ships as editable text is the disease being
   cured. `src/lib/provider-policy.ts` is deleted with it. The crate is the single source of
   truth for the agentic surface; the UI *reads* the permitted roster from the crate over a Tauri
   command seam and never enforces anything itself.
3. **Every goose spawn goes through `holmes_guard::spawn::sanitized_spawn` (L2)** in Rust:
   wholesale `env_clear`, explicit env rebuild, HTTP(S)_PROXY pinned to the in-process **L1a**
   deny-by-default egress proxy (`holmes_guard::proxy::EgressProxy`), provider/model injected
   only after **L1b** resolution, one BYOK credential validated against the provider. Process
   creation moves from the frontend (`@tauri-apps/plugin-shell` sidecar) behind a Rust seam;
   stdio is bridged to the existing ACP client over Tauri IPC channels.
4. **The Rust `custom_provider_*` commands gain compiled screening.** Today they forward any URL
   with zero Rust-side checks — the TS `assertProviderAllowed` upstream of the invoke is the only
   gate, and it is strippable. Enforcement moves inside the commands.

## The semantics change this ratifies (stated in full — no surprises)

The crate's L1b is a **deny-by-default allowlist**; Alfred's TS layer was allow-by-default with a
three-vendor denylist. Adopting the crate on the agentic (goose) surface means:

| Was (TS denylist) | Becomes (crate L1b) |
|---|---|
| Any goose provider id not resolving to Meta/OpenAI/xAI permitted (openrouter, groq, together, lmstudio, huggingface, nano-gpt, gemini_oauth, custom_deepseek, …) | Exactly six providers: **anthropic, google, deepseek, qwen, mistral, ollama**; everything else denied — including **openrouter and litellm, excluded as vendor-reaching intermediaries** |
| Any non-excluded model id permitted (llama3 on Ollama pinned ALLOWED by the false-positive suite; deepseek-r1 on Ollama allowed) | Per-provider **model families** only (anthropic `claude-`, google `gemini-`/`gemma`, deepseek `deepseek-v`, qwen `qwen`, mistral `mistral`/`magistral`/`ministral`, ollama `qwen`/`gemma`/`magistral`/`mistral`); **llama-family ids deny everywhere** (`ollama` provider-id carve-out only); unknown ids deny |
| No egress-host enforcement at spawn level | L1a proxy: exact host:port allowlist (six vendor API hosts + loopback:11434), everything else denied fail-closed |

Rationale for accepting the narrowing on the agentic surface: the brief's own Track-1 test list
is the crate's set (Anthropic/Google/DeepSeek/Qwen/Magistral/Gemma pass); deny-by-default is what
makes the guarantee compiler-backed rather than pattern-maintained; and the goose surface is the
agentic one — the blast radius of a mis-permitted provider is tool-wielding sessions, not chat.
The trade is real and Martin's merge is the sign-off. If openrouter (or family widening) is
wanted back, the path is a Holmes-side policy-table change at the next pin bump — never an
Alfred-side fork, vendor, or patch-around (brief §6).

## The two-regime boundary (why ADR-0004 still stands)

**Direct Chat — non-agentic** (ADR-0004: Accepted KEEP, binding conditions; "OpenAI-compatible is
a wire format, not a vendor") continues under Alfred's canon **denylist** semantics: refuse only
what resolves to Meta/OpenAI/xAI; Ollama/LM Studio/vLLM/MapleAI-class endpoints and llama-family
open weights on permitted infrastructure remain permitted. What changes is **where** that policy
lives: it moves from strippable TS (`provider-policy.ts`) into compiled Rust inside the
`custom_provider_*` commands (`src-tauri/src/direct_chat_policy.rs`), with the false-positive
suite ported as Rust tests. This module is the one remaining Alfred-side policy table; it is
scoped to the non-agentic surface, carries the same excluded-vendor literal class the L3 advisory
layer already tracks, and is flagged as a candidate for upstreaming into holmes-guard (an
endpoint-exclusion surface) as a Holmes-side decision.

Two regimes is not two sources of truth for one question: the agentic question ("which
provider/model may drive tools through goose?") is answered only by the crate; the non-agentic
question ("which chat endpoint may Direct Chat call?") is answered only by the compiled Alfred
module — each surface has exactly one authority, both compiled.

## Consequences

- Web build: unchanged — verified this session to have **no provider egress** (throwing stubs;
  no AI fetch paths). Nothing to enforce web-side; recorded in LOOP-INTEGRATION.md (flag 1a).
- The goose UI provider picker narrows to the crate roster; defaults change (`ollama` default
  model must be family-permitted, e.g. `qwen3:latest` not `llama3`).
- The B5 startup config scan is reimplemented in Rust from crate primitives
  (token/family/env-var-key screens + the canary host). Residual stated honestly: a bare
  `api.x.ai` URL with no other signal is not token-matchable from crate exports; under
  `sanitized_spawn` a config cannot select a provider at all (env wins, environment cleared
  wholesale), so the scan is advisory hygiene, not the enforcement line.
- Recipe runs (`goose recipe validate` / `goose run --recipe`) validate and build env through
  `sanitized_spawn` (L1b + sanitized env verbatim); the `acp` session uses the returned Command
  as-is, recipe invocations rebuild the Command with the same binary, cleared env, and the same
  sanitized map, differing only in args. Recorded here because `sanitized_spawn` hardcodes the
  `acp` argument; generalizing it is a candidate Holmes-side item.
- Live-goose verification of the new spawn path against Alfred's staged goose **1.41.0** routes
  to Windows/the release lane (this container has no sidecar and no GTK). Holmes verified the
  spawn/handshake class against 1.43.0; bumping Alfred's pin to 1.43.0 is a **separate Martin
  decision**, deliberately not taken here.
- Test intent is preserved by the mapping table in the Track-1 PR body (old test → new home);
  net coverage grows (Rust seam tests + release-mode refusal tests + the artifact-level Track-2
  job that this adoption makes possible).
