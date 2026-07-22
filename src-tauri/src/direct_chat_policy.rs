// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
//! Direct Chat (non-agentic) vendor-exclusion policy — compiled (ADR-0008).
//!
//! This is the Rust home of the canon **denylist** that used to live in
//! `src/lib/provider-policy.ts`: refuse only what resolves to an excluded
//! vendor — Meta, OpenAI, or xAI — and permit every other endpoint/model.
//! ADR-0004's binding condition holds: "OpenAI-compatible" is a wire format,
//! not a vendor, so Ollama / LM Studio / vLLM / proxy-class endpoints and
//! llama-family open weights on permitted infrastructure stay permitted.
//!
//! Scope (ADR-0008 two-regime boundary): this module answers ONLY the
//! non-agentic Direct Chat question, enforced inside the `custom_provider_*`
//! Tauri commands. The agentic (goose) surface is answered ONLY by
//! `holmes_guard` (deny-by-default L1b) through `guard.rs`. One authority per
//! surface, both compiled. This file is the single Alfred-side home of
//! excluded-vendor literals (the same advisory-scan class the deleted TS
//! files carried) and is flagged for upstreaming into holmes-guard as an
//! endpoint-exclusion surface.

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExcludedVendor {
    Meta,
    Openai,
    Xai,
}

impl ExcludedVendor {
    pub fn label(self) -> &'static str {
        match self {
            ExcludedVendor::Meta => "Meta",
            ExcludedVendor::Openai => "OpenAI",
            ExcludedVendor::Xai => "xAI",
        }
    }
}

impl fmt::Display for ExcludedVendor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.label())
    }
}

// --- Excluded-vendor signal tables (the denylist) ---------------------------
// Ported 1:1 from the deleted provider-policy.ts. Anything matching none of
// these is permitted.

const OPENAI_PROVIDER_TOKENS: &[&str] = &["openai", "azureopenai", "codex"];
const XAI_PROVIDER_TOKENS: &[&str] = &["xai", "grok"];
const META_PROVIDER_TOKENS: &[&str] = &["metaai", "metallama"];

// Endpoint host suffixes (matched as exact host or `*.suffix`, never substring,
// so "max.airline.com" can never match "x.ai").
const OPENAI_HOSTS: &[&str] = &["openai.com", "openai.azure.com", "oai.azure.com"];
const XAI_HOSTS: &[&str] = &["x.ai"];
const META_HOSTS: &[&str] = &[
    "meta.com",
    "meta.ai",
    "llama.meta.com",
    "llama-api.com",
    "llamaapi.com",
];

/// Normalize a provider name for token matching (lowercase, separators stripped).
fn normalize_provider(provider: &str) -> String {
    provider
        .to_lowercase()
        .chars()
        .filter(|c| !matches!(c, ' ' | '.' | '_' | '/' | '-') && !c.is_whitespace())
        .collect()
}

/// True when `host` is exactly `suffix` or a subdomain of it.
fn host_matches(host: &str, suffix: &str) -> bool {
    host == suffix || host.ends_with(&format!(".{suffix}"))
}

/// Extract the lowercased hostname from a URL. Returns None for anything that
/// does not parse as scheme://[userinfo@]host[:port][/...] — an unparseable
/// endpoint carries no exclusion signal; the caller decides (parity with the
/// TS `new URL` catch → null).
fn extract_host(endpoint: &str) -> Option<String> {
    let rest = endpoint.split_once("://")?.1;
    // Authority ends at the first path/query/fragment delimiter.
    let authority = rest
        .split(['/', '?', '#'])
        .next()
        .filter(|a| !a.is_empty())?;
    // Userinfo, if any, precedes the last '@' in the authority.
    let hostport = authority.rsplit_once('@').map(|(_, h)| h).unwrap_or(authority);
    // IPv6 literal: [::1]:443
    let host = if let Some(stripped) = hostport.strip_prefix('[') {
        stripped.split_once(']')?.0
    } else {
        // Strip a :port only when what follows the last ':' is all digits.
        match hostport.rsplit_once(':') {
            Some((h, p)) if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) => h,
            _ => hostport,
        }
    };
    if host.is_empty() {
        return None;
    }
    Some(host.to_lowercase())
}

/// True when `needle` occurs in `haystack` with a non-alphanumeric (or
/// start-of-string) character immediately before it.
fn contains_with_loose_left_boundary(haystack: &str, needle: &str) -> bool {
    let bytes = haystack.as_bytes();
    let mut from = 0;
    while let Some(pos) = haystack[from..].find(needle) {
        let at = from + pos;
        let left_ok = at == 0 || !bytes[at - 1].is_ascii_alphanumeric();
        if left_ok {
            return true;
        }
        from = at + 1;
    }
    false
}

/// Resolve a model id to an excluded vendor, or None. Ported rules:
/// OpenAI = branded product line, not generic "gpt" (EleutherAI's gpt-j /
/// gpt-neox are open and permitted); xAI = Grok / xai token. Deliberately NO
/// Meta model-id rule: Llama weights served by permitted infrastructure pay
/// Meta-the-vendor nothing (the false-positive tests pin this).
fn model_vendor(model: &str) -> Option<ExcludedVendor> {
    let m = model.to_lowercase();

    let openai_gpt_family = contains_with_loose_left_boundary(&m, "gpt-3")
        || contains_with_loose_left_boundary(&m, "gpt-4")
        || contains_with_loose_left_boundary(&m, "gpt-5")
        || contains_with_loose_left_boundary(&m, "gpt-oss")
        || contains_with_loose_left_boundary(&m, "gpt-image")
        || contains_with_loose_left_boundary(&m, "gpt-audio")
        || contains_with_loose_left_boundary(&m, "gpt-realtime");
    // OpenAI o-series reasoning ids at the start of the model string: o1-o4,
    // then end or '-' (parity with /^o[1-4](-|$)/).
    let o_series = {
        let b = m.as_bytes();
        b.len() >= 2
            && b[0] == b'o'
            && (b'1'..=b'4').contains(&b[1])
            && (b.len() == 2 || b[2] == b'-')
    };
    if m.contains("openai")
        || m.contains("chatgpt")
        || m.contains("davinci")
        || m.contains("codex")
        || openai_gpt_family
        || o_series
    {
        return Some(ExcludedVendor::Openai);
    }

    // xAI: Grok anywhere; "xai" with non-letter (or edge) boundaries, parity
    // with /(^|[^a-z])xai(\b|[^a-z])/.
    if m.contains("grok") {
        return Some(ExcludedVendor::Xai);
    }
    let bytes = m.as_bytes();
    let mut from = 0;
    while let Some(pos) = m[from..].find("xai") {
        let at = from + pos;
        let left_ok = at == 0 || !bytes[at - 1].is_ascii_lowercase();
        let right = at + 3;
        let right_ok = right >= bytes.len() || !bytes[right].is_ascii_lowercase();
        if left_ok && right_ok {
            return Some(ExcludedVendor::Xai);
        }
        from = at + 1;
    }

    None
}

/// Resolve an endpoint host to an excluded vendor, or None.
fn endpoint_vendor(endpoint: &str) -> Option<ExcludedVendor> {
    let host = extract_host(endpoint)?;
    if OPENAI_HOSTS.iter().any(|h| host_matches(&host, h)) {
        return Some(ExcludedVendor::Openai);
    }
    if XAI_HOSTS.iter().any(|h| host_matches(&host, h)) {
        return Some(ExcludedVendor::Xai);
    }
    if META_HOSTS.iter().any(|h| host_matches(&host, h)) {
        return Some(ExcludedVendor::Meta);
    }
    None
}

/// Resolve a provider name to an excluded vendor, or None.
fn provider_vendor(provider: &str) -> Option<ExcludedVendor> {
    let p = normalize_provider(provider);
    if OPENAI_PROVIDER_TOKENS.iter().any(|t| p.contains(t)) {
        return Some(ExcludedVendor::Openai);
    }
    if XAI_PROVIDER_TOKENS.iter().any(|t| p.contains(t)) {
        return Some(ExcludedVendor::Xai);
    }
    if META_PROVIDER_TOKENS.iter().any(|t| p.contains(t)) {
        return Some(ExcludedVendor::Meta);
    }
    None
}

/// A provider identity to screen. Any combination of fields may be supplied;
/// any field that resolves to an excluded vendor poisons the whole identity.
#[derive(Debug, Clone, Default)]
pub struct ProviderIdentity<'a> {
    pub provider: Option<&'a str>,
    pub endpoint: Option<&'a str>,
    pub model: Option<&'a str>,
}

/// Resolve a provider identity to an excluded vendor, or None if permitted.
pub fn resolve_excluded_vendor(id: &ProviderIdentity) -> Option<ExcludedVendor> {
    id.provider
        .and_then(provider_vendor)
        .or_else(|| id.endpoint.and_then(endpoint_vendor))
        .or_else(|| id.model.and_then(model_vendor))
}

pub struct ProviderCheck {
    pub allowed: bool,
    /// The excluded vendor that caused a refusal — caller-facing (diagnostics/UI);
    /// the command path consumes `allowed`/`reason`.
    #[allow(dead_code)]
    pub vendor: Option<ExcludedVendor>,
    pub reason: Option<String>,
}

/// Check a full provider identity against the denylist.
pub fn check_provider(id: &ProviderIdentity) -> ProviderCheck {
    let Some(vendor) = resolve_excluded_vendor(id) else {
        return ProviderCheck {
            allowed: true,
            vendor: None,
            reason: None,
        };
    };
    let what = if id.model.map(model_vendor) == Some(Some(vendor)) {
        format!("Model \"{}\"", id.model.unwrap_or_default())
    } else if id.endpoint.map(endpoint_vendor) == Some(Some(vendor)) {
        format!("Endpoint \"{}\"", id.endpoint.unwrap_or_default())
    } else {
        format!("Provider \"{}\"", id.provider.unwrap_or_default())
    };
    ProviderCheck {
        allowed: false,
        vendor: Some(vendor),
        reason: Some(format!(
            "{what} resolves to the excluded vendor {}. Alfred excludes only Meta, OpenAI, and xAI; every other provider/model is permitted.",
            vendor.label()
        )),
    }
}

/// Screen a Direct Chat endpoint URL (and optional model id). Returns Err with
/// the user-facing refusal reason when the identity is excluded — the shape
/// the `custom_provider_*` commands surface directly.
pub fn ensure_endpoint_allowed(endpoint: &str, model: Option<&str>) -> Result<(), String> {
    let check = check_provider(&ProviderIdentity {
        provider: None,
        endpoint: Some(endpoint),
        model,
    });
    if check.allowed {
        Ok(())
    } else {
        Err(check
            .reason
            .unwrap_or_else(|| "Provider not allowed.".to_string()))
    }
}

/// Extract the "model" field from an OpenAI-wire-format JSON request body, if
/// present — the same screen the TS adapter applied before invoking.
pub fn model_from_body(body: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
    parsed
        .get("model")
        .and_then(|m| m.as_str())
        .map(str::to_owned)
}
