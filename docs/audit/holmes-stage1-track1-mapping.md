# Track 1 — test mapping: retiring the TypeScript policy layer (ADR-0008)

Every test removed with the deleted TS policy layer, mapped to the crate-backed
equivalent that now pins the same (or narrower) intent. Net coverage grows:
Rust guard-seam + Direct Chat suites (50 cargo tests, incl. a spawn-execution
proof) plus the Track-2 artifact-level job. No intent lost; deny-by-default
narrowings are pinned deliberately with ADR-0008 named.

## Deleted files

- `src/lib/goose/provider-lockdown.ts` (the brief's named deletion)
- `src/lib/provider-policy.ts`
- `src/lib/goose/distribution.ts`
- `src/lib/goose/provider-lockdown.test.ts` (32)
- `src/lib/provider-policy.test.ts` (30)
- `src/lib/goose/config-scan.test.ts` (4)
- `src/lib/ai-credentials.fp.test.ts` (1 mega-test / 40 table rows)
- `src/lib/goose/acp-handshake.test.ts` (1, Windows-live)
- `src/lib/goose/permission-startup.test.ts` (1, Windows-live)
- `src/lib/goose/tool-gate.test.ts`: removed 3 permission-yaml cases (generator moved to Rust)

## Mapping (old test → new home)

| Old test (file → case) | New home |
|---|---|
| provider-lockdown.test.ts [1–7] refuses each goose-advertised excluded id (openai, azure_openai, chatgpt_codex, codex, codex-acp, xai, xai_oauth) | `guard_tests::l1b_refuses_every_goose_advertised_excluded_id` (deny-by-default: vendor ids deny as excluded, novel spellings deny as unknown) |
| provider-lockdown.test.ts [8] classifies excluded ids to the right vendor | subsumed by the resolution Denial variants in `l1b_refuses_*` |
| provider-lockdown.test.ts [9–23] accepts 15 permitted goose ids | `guard_tests::l1b_accepts_the_permitted_roster_with_family_models` (crate roster) + `l1b_denies_unknown_providers_and_out_of_family_models` — **ADR-0008 narrowing**: openrouter/groq/lmstudio/together/huggingface/nano-gpt now deny on the agentic surface (pinned deliberately) |
| provider-lockdown.test.ts [24] filterGooseProviderOptions strips excluded | superseded: the UI reads `guard_permitted_providers` (crate roster) and never sees an excluded id — `guard::guard_permitted_providers` + `l1b_accepts_the_permitted_roster` |
| provider-lockdown.test.ts [25] locked-down env, ambient excluded keys blanked | `guard_tests::l2_builds_a_locked_down_env_and_ambient_excluded_vars_cannot_survive` (stronger: wholesale env_clear, ambient cannot survive at all) |
| provider-lockdown.test.ts [26] non-Anthropic/Google open provider routes key | `guard_tests::l1b_accepts_the_permitted_roster` (mistral) + BYOK via `PROVIDER_CREDENTIAL_KEYS` |
| provider-lockdown.test.ts [27] local Ollama sets OLLAMA_HOST | `guard_tests::l2_recipe_invocations_carry_the_same_sanitized_env` (ollama + OLLAMA_HOST) |
| provider-lockdown.test.ts [28] refuses env for excluded provider | `guard_tests::l2_refuses_an_excluded_provider_even_when_the_env_demands_it` |
| provider-lockdown.test.ts [29] excluded model poisons permitted provider | `guard_tests::l1b_denies_unknown_providers_and_out_of_family_models` (ollama/gpt-4o → ExcludedModelFamily) |
| provider-lockdown.test.ts [30] extra cannot re-introduce excluded key | `guard_tests::l2_refuses_extra_env_that_is_provider_selecting` (stronger: ANY provider-selecting extra refused outright, not silently skipped) |
| provider-lockdown.test.ts [31] config registers vault ext, no excluded mention | `guard_tests::config_yaml_registers_the_vault_extension_and_pins_the_resolved_pair` |
| provider-lockdown.test.ts [32] refuses config for excluded provider | `guard_tests::config_yaml_refuses_a_denied_pair` |
| provider-policy.test.ts [1–7] excluded vendors refused (endpoint/model/provider/azure/aggregator) | `direct_chat_policy_tests::refuses_openai_by_endpoint_and_model`, `refuses_azure_openai_by_endpoint`, `refuses_xai_by_endpoint_and_grok_by_model`, `refuses_meta_the_vendor_by_host_*`, `refuses_an_excluded_model_even_via_a_permitted_host`, `refuses_an_excluded_model_routed_through_a_permitted_aggregator`, `refuses_excluded_vendors_by_provider_name` |
| provider-policy.test.ts [8–14] non-excluded ACCEPTED (Mistral, Ollama, OpenRouter-open, Together/Groq/DeepSeek/Cohere/Fireworks, Anthropic/Google/local, EleutherAI gpt-*, no-model endpoint) | `direct_chat_policy_tests::accepts_mistral_*`, `accepts_arbitrary_local_ollama_models`, `accepts_openrouter_routing_an_open_model`, `accepts_other_non_excluded_hosted_providers`, `still_accepts_anthropic_google_and_local_self_hosted`, `accepts_eleutherai_open_gpt_family_models`, `accepts_an_endpoint_with_no_model_specified` (Direct Chat surface keeps the denylist per ADR-0004/0008) |
| provider-policy.test.ts [15] resolveExcludedVendor null/vendor | `direct_chat_policy_tests::resolve_returns_none_for_permitted_and_vendor_for_excluded` |
| provider-policy.test.ts [16–18] assert helpers | `direct_chat_policy_tests::ensure_endpoint_allowed_refuses_with_reason_and_passes_permitted` |
| provider-policy.test.ts [19–30] isLocalHost table | dropped: `isLocalHost` was informational-only (never a gate); the denylist decision is host-suffix, pinned by `host_matching_is_suffix_scoped_never_substring` |
| config-scan.test.ts [1–4] scanGooseConfigText | `guard_tests::b5_scan_flags_excluded_vendor_signals`, `b5_scan_passes_a_clean_generated_style_config`, `b5_scan_reports_one_finding_per_line_and_bounds_the_excerpt`, `b5_scan_documented_residual_bare_xai_host_is_not_flagged` (crate-primitive scan; the bare-host residual is now pinned honestly) |
| ai-credentials.fp.test.ts (40 rows: 12 must-block, 25 must-allow, 3 llama-on-permitted-infra) | `direct_chat_policy_tests::fp_table_must_stay_blocked_and_must_stay_allowed`, `fp_llama_on_permitted_infra_stays_allowed`, `host_matching_is_suffix_scoped_never_substring` |
| acp-handshake.test.ts (binary advertises openai/xai; filter strips them) | `guard_tests::l1b_refuses_every_goose_advertised_excluded_id` (the filter's replacement is deny-by-default; the UI never offers excluded ids) + Track-2 Windows release-lane live probe |
| permission-startup.test.ts (goose ingests permission.yaml without panic) | `guard_tests::permission_yaml_carries_the_three_required_lists` (shape) + Track-2 Windows release-lane live ingestion probe |
| tool-gate.test.ts buildPermissionYaml/goosePermissionPath (3) | `guard_tests::permission_yaml_carries_the_three_required_lists` (generation moved to `guard::build_permission_yaml`) |

## New coverage with no old equivalent (net growth)

- `guard_tests::l1b_refuses_openrouter_and_litellm_as_intermediaries` — the ADR-0008 intermediary exclusion.
- `guard_tests::l2_refuses_a_credential_that_does_not_belong_to_the_provider` — BYOK seam validation.
- `guard_tests::alfred_additive_env_keys_are_not_provider_selecting` — regression lock on the additive-env premise.
- `guard_tests::l2_built_command_actually_spawns_a_process_with_the_sanitized_env` — the container-runnable spawn-execution proof (stand-in for the Windows live-goose connection check).
- `direct_chat_policy_tests::model_from_body_extracts_the_wire_format_model_field` — the request-body model screen.

## Vitest delta (accounted for, no silent shrink)

Baseline 321 passed | 4 skipped → 252 passed | 2 skipped. Removed 70 passed
(32+30+4+1+3) → all mapped above; +1 added (connect-errors ollama-family
default). Removed 2 skipped (the two Windows-live instruments) → their intent
lives in Rust + the Track-2 Windows probe; recipes.live's 2 skips remain.
Rust suite 12 → 50.
