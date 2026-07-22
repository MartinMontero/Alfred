// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
//! Direct Chat policy tests — the ported intent of the deleted TS suites
//! (`provider-policy.test.ts`, 30 cases; `ai-credentials.fp.test.ts`, 40 table
//! rows). The decisive proof is not "the three excluded vendors are refused"
//! but "a provider that is NOT Anthropic/Google and NOT excluded is ACCEPTED" —
//! that is what distinguishes a denylist from an allowlist of three. The
//! llama-on-permitted-infra rows are load-bearing: a future re-added llama
//! model rule fails here (ADR-0004 binding condition; ADR-0008 scope note:
//! this holds on the Direct Chat surface — the agentic surface is the crate's).

use crate::direct_chat_policy::{
    check_provider, ensure_endpoint_allowed, model_from_body, resolve_excluded_vendor,
    ExcludedVendor, ProviderIdentity,
};

fn by_endpoint(endpoint: &str, model: Option<&str>) -> Option<ExcludedVendor> {
    resolve_excluded_vendor(&ProviderIdentity {
        provider: None,
        endpoint: Some(endpoint),
        model,
    })
}

fn by_provider(provider: &str) -> Option<ExcludedVendor> {
    resolve_excluded_vendor(&ProviderIdentity {
        provider: Some(provider),
        endpoint: None,
        model: None,
    })
}

fn by_model(model: &str) -> Option<ExcludedVendor> {
    resolve_excluded_vendor(&ProviderIdentity {
        provider: None,
        endpoint: None,
        model: Some(model),
    })
}

// --- excluded vendors (Meta/OpenAI/xAI) are refused --------------------------

#[test]
fn refuses_openai_by_endpoint_and_model() {
    assert_eq!(
        by_endpoint("https://api.openai.com/v1", Some("gpt-4o")),
        Some(ExcludedVendor::Openai)
    );
    let check = check_provider(&ProviderIdentity {
        provider: None,
        endpoint: Some("https://api.openai.com/v1"),
        model: Some("gpt-4o"),
    });
    assert!(!check.allowed);
    assert!(check.reason.unwrap().contains("OpenAI"));
}

#[test]
fn refuses_azure_openai_by_endpoint() {
    assert_eq!(
        by_endpoint("https://my-resource.openai.azure.com/v1", None),
        Some(ExcludedVendor::Openai)
    );
    assert_eq!(
        by_endpoint("https://foo.oai.azure.com/v1", None),
        Some(ExcludedVendor::Openai)
    );
}

#[test]
fn refuses_xai_by_endpoint_and_grok_by_model() {
    assert_eq!(by_endpoint("https://api.x.ai/v1", None), Some(ExcludedVendor::Xai));
    assert_eq!(by_model("grok-beta"), Some(ExcludedVendor::Xai));
    assert_eq!(by_model("grok-3"), Some(ExcludedVendor::Xai));
}

#[test]
fn refuses_meta_the_vendor_by_host_but_allows_llama_weights_on_permitted_infra() {
    assert_eq!(by_endpoint("https://llama-api.com/v1", None), Some(ExcludedVendor::Meta));
    assert_eq!(by_endpoint("https://api.meta.ai/v1", None), Some(ExcludedVendor::Meta));
    // Llama weights on permitted infrastructure are ALLOWED.
    assert_eq!(by_endpoint("http://localhost:11434/v1", Some("llama3.2")), None);
    assert_eq!(by_endpoint("http://localhost:11434/v1", Some("codellama")), None);
}

#[test]
fn refuses_an_excluded_model_even_via_a_permitted_host() {
    for model in ["gpt-4o", "o1-preview", "o3-mini"] {
        assert_eq!(
            by_endpoint("https://api.anthropic.com/v1", Some(model)),
            Some(ExcludedVendor::Openai),
            "model {model} must poison the identity"
        );
    }
}

#[test]
fn refuses_an_excluded_model_routed_through_a_permitted_aggregator() {
    assert_eq!(
        by_endpoint("https://openrouter.ai/api/v1", Some("openai/gpt-4o")),
        Some(ExcludedVendor::Openai)
    );
    assert_eq!(by_model("openai/o3-mini"), Some(ExcludedVendor::Openai));
}

#[test]
fn refuses_excluded_vendors_by_provider_name() {
    assert_eq!(by_provider("openai"), Some(ExcludedVendor::Openai));
    assert_eq!(by_provider("azure-openai"), Some(ExcludedVendor::Openai));
    assert_eq!(by_provider("xai"), Some(ExcludedVendor::Xai));
}

// --- non-excluded ACCEPTED (the load-bearing case) ---------------------------

#[test]
fn accepts_mistral_neither_anthropic_google_nor_excluded() {
    assert_eq!(by_endpoint("https://api.mistral.ai/v1", Some("mistral-large-latest")), None);
    assert_eq!(by_provider("mistral"), None);
}

#[test]
fn accepts_arbitrary_local_ollama_models() {
    for model in ["qwen2.5", "gemma2", "deepseek-r1"] {
        assert_eq!(by_endpoint("http://localhost:11434/v1", Some(model)), None);
    }
}

#[test]
fn accepts_openrouter_routing_an_open_model() {
    assert_eq!(
        by_endpoint("https://openrouter.ai/api/v1", Some("mistralai/mistral-7b-instruct")),
        None
    );
    assert_eq!(
        by_endpoint("https://openrouter.ai/api/v1", Some("qwen/qwen-2.5-72b-instruct")),
        None
    );
}

#[test]
fn accepts_other_non_excluded_hosted_providers() {
    assert_eq!(by_endpoint("https://api.together.xyz/v1", None), None);
    // Groq's path contains "openai" — host is what counts.
    assert_eq!(by_endpoint("https://api.groq.com/openai/v1", None), None);
    assert_eq!(by_endpoint("https://api.deepseek.com/v1", None), None);
    assert_eq!(by_endpoint("https://api.cohere.com/v2", None), None);
    assert_eq!(by_endpoint("https://api.fireworks.ai/inference/v1", Some("accounts/fireworks/models/qwen2p5-72b-instruct")), None);
}

#[test]
fn still_accepts_anthropic_google_and_local_self_hosted() {
    assert_eq!(by_endpoint("https://api.anthropic.com/v1", Some("claude-sonnet-4-6")), None);
    assert_eq!(
        by_endpoint("https://generativelanguage.googleapis.com/v1beta", Some("gemini-2.5-pro")),
        None
    );
    assert_eq!(by_endpoint("http://192.168.1.50:8000/v1", Some("gemma-2")), None);
}

#[test]
fn accepts_eleutherai_open_gpt_family_models() {
    for model in ["gpt-j", "gpt-neo", "gpt-neox", "gpt4all"] {
        assert_eq!(by_model(model), None, "{model} is open, not OpenAI");
    }
}

#[test]
fn accepts_an_endpoint_with_no_model_specified() {
    assert!(ensure_endpoint_allowed("https://api.mistral.ai/v1/chat/completions", None).is_ok());
}

// --- resolve + helpers --------------------------------------------------------

#[test]
fn resolve_returns_none_for_permitted_and_vendor_for_excluded() {
    assert_eq!(by_model("llama3.3"), None);
    assert_eq!(by_model("gpt-5"), Some(ExcludedVendor::Openai));
    assert_eq!(by_model("grok-2"), Some(ExcludedVendor::Xai));
    assert_eq!(by_endpoint("https://api.openai.com", None), Some(ExcludedVendor::Openai));
}

#[test]
fn ensure_endpoint_allowed_refuses_with_reason_and_passes_permitted() {
    assert!(ensure_endpoint_allowed("https://api.mistral.ai/v1", Some("mistral-large-latest")).is_ok());
    let err = ensure_endpoint_allowed("https://api.openai.com/v1", None).unwrap_err();
    assert!(err.contains("OpenAI"));
    assert!(err.contains("every other provider/model is permitted"));
}

#[test]
fn model_from_body_extracts_the_wire_format_model_field() {
    assert_eq!(
        model_from_body(r#"{"model":"gpt-4o","messages":[]}"#).as_deref(),
        Some("gpt-4o")
    );
    assert_eq!(model_from_body("not json"), None);
    assert_eq!(model_from_body(r#"{"messages":[]}"#), None);
}

// --- the false-positive table (ai-credentials.fp.test.ts, 40 rows) -----------

#[test]
fn fp_table_must_stay_blocked_and_must_stay_allowed() {
    // MUST-STAY-BLOCKED (12): a miss here is a broken exclusion.
    let blocked_hosts = ["api.openai.com", "api.x.ai"];
    for h in blocked_hosts {
        assert!(
            by_endpoint(&format!("https://{h}"), None).is_some(),
            "broken exclusion: host {h} must be blocked"
        );
    }
    let blocked_providers = [
        "openai", "azure_openai", "chatgpt_codex", "codex", "codex-acp", "xai", "xai_oauth",
    ];
    for p in blocked_providers {
        assert!(by_provider(p).is_some(), "broken exclusion: provider {p} must be blocked");
    }
    let blocked_models = ["gpt-4o", "o3", "grok-3"];
    for m in blocked_models {
        assert!(by_model(m).is_some(), "broken exclusion: model {m} must be blocked");
    }

    // MUST-BE-ALLOWED (25): any block here is a false positive.
    let allowed_hosts = [
        "parallax.ai",
        "syntax.ai",
        "relax.ai",
        "max.airline.com",
        "openrouter.ai",
        "notmeta.com",
    ];
    for h in allowed_hosts {
        assert_eq!(
            by_endpoint(&format!("https://{h}"), None),
            None,
            "false positive: host {h} must be allowed"
        );
    }
    let allowed_providers = [
        "openrouter", "mistral", "ollama", "groq", "together", "fireworks", "deepseek", "nano-gpt",
    ];
    for p in allowed_providers {
        assert_eq!(by_provider(p), None, "false positive: provider {p} must be allowed");
    }
    let allowed_models = [
        "gpt-neo", "gpt-j", "gpt-neox", "gpt4all", "tinyllama", "open-llama", "llamafile",
        "metamath", "armada-7b", "mixtral-8x7b", "qwen2.5",
    ];
    for m in allowed_models {
        assert_eq!(by_model(m), None, "false positive: model {m} must be allowed");
    }
}

#[test]
fn fp_llama_on_permitted_infra_stays_allowed() {
    // Load-bearing: a future re-added llama model rule fails HERE.
    assert_eq!(by_endpoint("https://api.groq.com/openai/v1", Some("llama-3.1-8b")), None);
    assert_eq!(
        by_endpoint("https://api.together.xyz/v1", Some("meta-llama/Llama-3-70b")),
        None,
        "meta-llama/ namespace on permitted infra is a model path, not the Meta vendor"
    );
    assert_eq!(by_endpoint("http://localhost:11434", Some("llama3")), None);
}

#[test]
fn host_matching_is_suffix_scoped_never_substring() {
    // Substring-match tripwires for x.ai and friends.
    assert_eq!(by_endpoint("https://max.airline.com", None), None);
    assert_eq!(by_endpoint("https://api.anthropic.com.evil.example", None), None);
    assert_eq!(by_endpoint("https://grok.x.ai", None), Some(ExcludedVendor::Xai));
    // Unparseable endpoints carry no exclusion signal (caller decides).
    assert_eq!(by_endpoint("not a url", None), None);
    // Userinfo cannot smuggle a permitted-looking host.
    assert_eq!(
        by_endpoint("https://api.anthropic.com@api.openai.com/v1", None),
        Some(ExcludedVendor::Openai)
    );
}
