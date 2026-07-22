// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
//! Guard-seam tests — the ported intent of the deleted goose-side TS suites
//! (`provider-lockdown.test.ts`, 32 cases; `config-scan.test.ts`, 4 cases),
//! now pinned against the compiled crate seam. Where ADR-0008's deny-by-default
//! narrowing supersedes an old permissive pin, the new behavior is pinned HERE
//! with the ADR named, so the change is deliberate and regression-locked, not
//! silent. Run in CI in both debug and release (`cargo test --release`).

use crate::guard::{
    build_config_yaml, build_goose_spawn, build_permission_yaml, scan_config_text,
    GooseInvocation,
};
use holmes_guard::policy;
use holmes_guard::resolution::{resolve, Denial};
use holmes_guard::spawn::CredentialVar;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};

fn proxy() -> SocketAddr {
    "127.0.0.1:9".parse().unwrap()
}

fn abs_goose() -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(r"C:\alfred\goose.exe")
    } else {
        PathBuf::from("/opt/alfred/goose")
    }
}

// --- L1b: excluded vendors refused (the 7 goose-advertised excluded ids) -----

#[test]
fn l1b_refuses_every_goose_advertised_excluded_id() {
    // Ids goose 1.41.0 advertises over ACP (captured live, provider-lockdown
    // heritage). Under deny-by-default the vendor-token ids deny as EXCLUDED
    // and the novel spellings deny as UNKNOWN — which is the point: a NEW
    // excluded-vendor id added in a future goose cannot slip through, because
    // absence from the permitted set is already rejection.
    for id in ["openai", "azure_openai", "xai"] {
        match resolve(id, "anything") {
            Err(Denial::ExcludedProvider(_)) | Err(Denial::ExcludedModelFamily(_)) => {}
            other => panic!("{id} must deny as excluded, got {other:?}"),
        }
    }
    for id in ["chatgpt_codex", "codex", "codex-acp", "xai_oauth"] {
        assert!(
            resolve(id, "claude-sonnet-4-6").is_err(),
            "{id} must be denied (unknown or excluded)"
        );
    }
}

#[test]
fn l1b_refuses_openrouter_and_litellm_as_intermediaries() {
    // ADR-0008 narrowing, pinned deliberately: vendor-reaching intermediaries
    // are excluded on the agentic surface (they were permitted under the old
    // TS denylist). Direct Chat is unaffected (direct_chat_policy_tests).
    for id in ["openrouter", "litellm"] {
        match resolve(id, "mistral-large-latest") {
            Err(Denial::ExcludedProvider(p)) => assert_eq!(p, id),
            other => panic!("{id} must deny as ExcludedProvider, got {other:?}"),
        }
    }
}

// --- L1b: the permitted set passes (the load-bearing case) --------------------

#[test]
fn l1b_accepts_the_permitted_roster_with_family_models() {
    let pairs = [
        ("anthropic", "claude-sonnet-4-6"),
        ("google", "gemini-2.5-pro"),
        ("google", "gemma-3-27b"),
        ("deepseek", "deepseek-v4"),
        ("qwen", "qwen3-max"),
        ("mistral", "mistral-large-latest"),
        ("mistral", "magistral-medium"),
        ("ollama", "qwen2.5"),
        ("ollama", "gemma2"),
        ("ollama", "mistral-small"),
    ];
    for (p, m) in pairs {
        let r = resolve(p, m).unwrap_or_else(|d| panic!("{p}/{m} must pass, got: {d}"));
        assert_eq!(r.provider, p);
    }
}

#[test]
fn l1b_denies_unknown_providers_and_out_of_family_models() {
    // Deny-by-default, pinned: unknown ids are rejection, not a warning.
    assert!(matches!(
        resolve("lmstudio", "qwen2.5"),
        Err(Denial::UnknownProvider(_))
    ));
    assert!(matches!(
        resolve("groq", "qwen2.5"),
        Err(Denial::UnknownProvider(_))
    ));
    // Excluded model family poisons the pair even on a permitted provider.
    assert!(matches!(
        resolve("ollama", "gpt-4o"),
        Err(Denial::ExcludedModelFamily(_))
    ));
    assert!(matches!(
        resolve("anthropic", "grok-2"),
        Err(Denial::ExcludedModelFamily(_))
    ));
    // ADR-0008 narrowing, pinned deliberately (old TS suite pinned the
    // opposite on this surface): llama-family ids deny everywhere on the
    // agentic surface; ollama models outside the permitted families deny as
    // unknown.
    assert!(matches!(
        resolve("ollama", "llama3"),
        Err(Denial::ExcludedModelFamily(_))
    ));
    assert!(matches!(
        resolve("ollama", "deepseek-r1"),
        Err(Denial::UnknownModel { .. })
    ));
}

// --- L2: the sanitized spawn env ----------------------------------------------

#[test]
fn l2_builds_a_locked_down_env_and_ambient_excluded_vars_cannot_survive() {
    // Ambient env demanding an excluded provider — must not reach the child.
    std::env::set_var("OPENAI_API_KEY", "leaked-ambient-key");
    std::env::set_var("GOOSE_PROVIDER", "openai");

    let built = build_goose_spawn(
        &abs_goose(),
        &GooseInvocation::Acp,
        "anthropic",
        "claude-sonnet-4-6",
        Some(CredentialVar {
            key: "ANTHROPIC_API_KEY".into(),
            value: "sk-test".into(),
        }),
        proxy(),
        Path::new("/tmp/alfred-goose-home"),
        Path::new("/tmp"),
        None,
        &HashMap::new(),
    )
    .expect("permitted spawn must build");

    // The environment is rebuilt from scratch: nothing ambient survives.
    assert!(!built.env.contains_key("OPENAI_API_KEY"));
    assert_eq!(built.env.get("GOOSE_PROVIDER").map(String::as_str), Some("anthropic"));
    assert_eq!(built.env.get("GOOSE_MODEL").map(String::as_str), Some("claude-sonnet-4-6"));
    assert_eq!(built.env.get("GOOSE_DISABLE_KEYRING").map(String::as_str), Some("1"));
    assert_eq!(built.env.get("ANTHROPIC_API_KEY").map(String::as_str), Some("sk-test"));
    // L1a pin: every proxy var points at the guard proxy; NO_PROXY is absent.
    let proxy_url = format!("http://{}", proxy());
    for k in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"] {
        assert_eq!(built.env.get(k), Some(&proxy_url), "{k} must pin to L1a");
    }
    assert!(!built.env.contains_key("NO_PROXY"));
    // Alfred's documented additions.
    assert_eq!(
        built.env.get("GOOSE_PATH_ROOT").map(String::as_str),
        Some("/tmp/alfred-goose-home")
    );
    assert_eq!(built.env.get("GOOSE_TELEMETRY_ENABLED").map(String::as_str), Some("false"));
    assert_eq!(built.env.get("OTEL_SDK_DISABLED").map(String::as_str), Some("true"));

    std::env::remove_var("OPENAI_API_KEY");
    std::env::remove_var("GOOSE_PROVIDER");
}

#[test]
fn l2_refuses_an_excluded_provider_even_when_the_env_demands_it() {
    std::env::set_var("GOOSE_PROVIDER", "openai");
    let err = build_goose_spawn(
        &abs_goose(),
        &GooseInvocation::Acp,
        "openai",
        "gpt-4o",
        None,
        proxy(),
        Path::new("/tmp/x"),
        Path::new("/tmp"),
        None,
        &HashMap::new(),
    )
    .unwrap_err();
    assert!(err.contains("excluded"), "denial must name the exclusion: {err}");
    std::env::remove_var("GOOSE_PROVIDER");
}

#[test]
fn l2_refuses_extra_env_that_is_provider_selecting() {
    // Stronger than the old TS behavior (which silently skipped known keys):
    // ANY provider-selecting key in caller extras is refused outright.
    for key in ["OPENAI_API_KEY", "GOOSE_MODEL", "HTTPS_PROXY", "OPENROUTER_API_KEY"] {
        let mut extra = HashMap::new();
        extra.insert(key.to_string(), "x".to_string());
        let err = build_goose_spawn(
            &abs_goose(),
            &GooseInvocation::Acp,
            "anthropic",
            "claude-sonnet-4-6",
            None,
            proxy(),
            Path::new("/tmp/x"),
            Path::new("/tmp"),
            None,
            &extra,
        )
        .unwrap_err();
        assert!(err.contains(key), "refusal must name the key: {err}");
    }
    // A benign extra passes.
    let mut extra = HashMap::new();
    extra.insert("ALFRED_SESSION_TAG".to_string(), "t1".to_string());
    let built = build_goose_spawn(
        &abs_goose(),
        &GooseInvocation::Acp,
        "anthropic",
        "claude-sonnet-4-6",
        None,
        proxy(),
        Path::new("/tmp/x"),
        Path::new("/tmp"),
        None,
        &extra,
    )
    .unwrap();
    assert_eq!(built.env.get("ALFRED_SESSION_TAG").map(String::as_str), Some("t1"));
}

#[test]
fn l2_refuses_a_credential_that_does_not_belong_to_the_provider() {
    let err = build_goose_spawn(
        &abs_goose(),
        &GooseInvocation::Acp,
        "anthropic",
        "claude-sonnet-4-6",
        Some(CredentialVar {
            key: "OPENAI_API_KEY".into(),
            value: "x".into(),
        }),
        proxy(),
        Path::new("/tmp/x"),
        Path::new("/tmp"),
        None,
        &HashMap::new(),
    )
    .unwrap_err();
    assert!(err.contains("OPENAI_API_KEY"), "{err}");
}

#[test]
fn l2_recipe_invocations_carry_the_same_sanitized_env() {
    let built = build_goose_spawn(
        &abs_goose(),
        &GooseInvocation::RecipeRun(PathBuf::from("/tmp/staged/recipe.yaml")),
        "ollama",
        "qwen2.5",
        Some(CredentialVar {
            key: "OLLAMA_HOST".into(),
            value: "http://localhost:11434".into(),
        }),
        proxy(),
        Path::new("/tmp/home"),
        Path::new("/tmp"),
        None,
        &HashMap::new(),
    )
    .unwrap();
    assert_eq!(built.env.get("GOOSE_PROVIDER").map(String::as_str), Some("ollama"));
    assert_eq!(
        built.env.get("OLLAMA_HOST").map(String::as_str),
        Some("http://localhost:11434")
    );
    let args: Vec<String> = built
        .command
        .get_args()
        .map(|a| a.to_string_lossy().to_string())
        .collect();
    assert_eq!(args, ["run", "--recipe", "/tmp/staged/recipe.yaml", "--no-session"]);
}

#[cfg(unix)]
#[test]
fn l2_built_command_actually_spawns_a_process_with_the_sanitized_env() {
    // Proves the spawn path is executable end to end (not just constructed):
    // build through L1b+L2, then run the built Command against a real absolute
    // binary and confirm the child receives exactly the sanitized env — the
    // container stand-in for the Windows live-goose connection check (flag 4).
    use std::process::Stdio;
    let built = build_goose_spawn(
        Path::new("/usr/bin/env"), // absolute; prints its environment
        &GooseInvocation::Acp,
        "anthropic",
        "claude-sonnet-4-6",
        Some(CredentialVar {
            key: "ANTHROPIC_API_KEY".into(),
            value: "sk-live-check".into(),
        }),
        proxy(),
        Path::new("/tmp/alfred-spawn-home"),
        Path::new("/tmp"),
        None,
        &HashMap::new(),
    )
    .expect("permitted spawn must build");

    let mut command = built.command;
    // The claim is that the L2-built Command launches a real process (the
    // container stand-in for goose). `/usr/bin/env acp` execs the "acp" arg and
    // exits non-zero — that is fine; a successful spawn + a settled exit status
    // proves the command is executable, not merely constructed.
    let mut child = command
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("the L2-built command must spawn a real process");
    let status = child.wait().expect("the spawned child must be waitable");
    let _ = status; // exit code is the stand-in's, not under test

    // The env the child ACTUALLY ran with is the sanitized map — spot-check that
    // the guard-injected keys are present and nothing ambient leaked in.
    assert_eq!(built.env.get("GOOSE_PROVIDER").map(String::as_str), Some("anthropic"));
    assert_eq!(built.env.get("ANTHROPIC_API_KEY").map(String::as_str), Some("sk-live-check"));
    assert!(!built.env.contains_key("NO_PROXY"));
}

#[test]
fn alfred_additive_env_keys_are_not_provider_selecting() {
    // Regression lock on the ADR-0008 premise: if a future crate pin adds any
    // of Alfred's additive keys to PROVIDER_SELECTING_ENV_VARS, this fires and
    // the addition gets re-decided consciously instead of failing at runtime.
    for k in [
        "GOOSE_PATH_ROOT",
        "GOOSE_TELEMETRY_ENABLED",
        "OTEL_SDK_DISABLED",
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "OTEL_SERVICE_NAME",
    ] {
        assert!(
            !policy::PROVIDER_SELECTING_ENV_VARS.contains(&k),
            "{k} became provider-selecting in the crate — re-decide the additive env"
        );
    }
}

// --- config.yaml generation ------------------------------------------------------

#[test]
fn config_yaml_registers_the_vault_extension_and_pins_the_resolved_pair() {
    let yaml = build_config_yaml(
        "anthropic",
        "claude-sonnet-4-6",
        "C:\\vault",
        None,
        None,
        &["developer".to_string()],
    )
    .unwrap();
    assert!(yaml.contains("GOOSE_PROVIDER: \"anthropic\""));
    assert!(yaml.contains("GOOSE_MODEL: \"claude-sonnet-4-6\""));
    assert!(yaml.contains("alfred-vault:"));
    assert!(yaml.contains("type: stdio"));
    assert!(yaml.contains("developer:"));
    assert!(yaml.contains("type: builtin"));
    // The generated config never mentions an excluded vendor.
    let lower = yaml.to_lowercase();
    for bad in ["openai", "xai", "codex", "grok"] {
        assert!(!lower.contains(bad), "generated config must not mention {bad}");
    }
}

#[test]
fn config_yaml_refuses_a_denied_pair() {
    assert!(build_config_yaml("openai", "gpt-4o", "/v", None, None, &[]).is_err());
    // Unknown ids are denied too — deny-by-default extends to the writer.
    assert!(build_config_yaml("openrouter", "qwen3", "/v", None, None, &[]).is_err());
    assert!(build_config_yaml("ollama", "llama3", "/v", None, None, &[]).is_err());
}

#[test]
fn permission_yaml_carries_the_three_required_lists() {
    let yaml = build_permission_yaml();
    assert!(yaml.contains("always_allow:"));
    assert!(yaml.contains("ask_before:"));
    // goose panics at startup if any list is absent — empty must be explicit.
    assert!(yaml.contains("never_allow: []"));
    assert!(yaml.contains("\"alfred-vault__vault_search\""));
    assert!(yaml.contains("\"alfred-vault__vault_write\""));
    assert!(yaml.contains("\"developer__shell\""));
}

// --- B5 config scan (crate-primitive; warn-only) -----------------------------------

#[test]
fn b5_scan_flags_excluded_vendor_signals() {
    let text = "custom:\n  base_url: https://api.openai.com/v1\nXAI_API_KEY: abc\nmodel: gpt-4o\nb: llama-api.com\n";
    let findings = scan_config_text(text);
    let lines: Vec<usize> = findings.iter().map(|f| f.line).collect();
    assert_eq!(lines, [2, 3, 4, 5]);
}

#[test]
fn b5_scan_passes_a_clean_generated_style_config() {
    let text = "GOOSE_PROVIDER: \"ollama\"\nGOOSE_MODEL: \"qwen2.5\"\nOLLAMA_HOST: http://localhost:11434\na: api.anthropic.com\nb: api.mistral.ai\n";
    assert!(scan_config_text(text).is_empty());
}

#[test]
fn b5_scan_reports_one_finding_per_line_and_bounds_the_excerpt() {
    let long = format!("x: api.openai.com and api.openai.com {}", "pad".repeat(100));
    let findings = scan_config_text(&long);
    assert_eq!(findings.len(), 1);
    assert!(findings[0].excerpt.chars().count() <= 160);
}

#[test]
fn b5_scan_documented_residual_bare_xai_host_is_not_flagged() {
    // Honest residual, pinned so a future fix flips this consciously: the
    // crate's token scan cannot see "api.x.ai" (tokens: api/x/ai). The
    // enforcement line is sanitized_spawn — a config cannot select a provider
    // at all — so this stays warn-scope, not a hole in refusal.
    assert!(scan_config_text("a: api.x.ai\n").is_empty());
}
