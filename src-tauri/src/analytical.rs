// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
//! The analytical surface (Track 4, D-14 Option A — analytical open beta).
//!
//! holmes-core has no serde (zero third-party deps by design), so this module
//! is the IPC projection layer: it maps the crate's sealed, getter-based types
//! into serde DTOs that cross the Tauri boundary, and maps operator UI input
//! back into the crate's *constructors* — never around them.
//!
//! Load-bearing invariants (integration-brief §5–6, compiler-backed here):
//!
//! - **Render only `EmittedEvidencePack`.** [`EmittedPackDto`] is constructible
//!   ONLY from `&EmittedEvidencePack` ([`EmittedPackDto::from_emitted`]). There
//!   is no `from_pack(&EvidencePack)` — a raw, un-emitted pack has no render
//!   path. The wrapper's existence is the proof the emission gate ran.
//! - **The emission gate is the crate's.** [`analytical_emit`] builds an
//!   `EvidencePack` from operator input, then calls `emission::emit` — the real
//!   lock-1a + lock-2.5b gate. A denial is surfaced verbatim (the honesty is
//!   rendered, never truncated), never worked around.
//! - **Grants mint only from an explicit operator Approved.** [`ToolGrant`] is
//!   sealed; the only mint is `record_decision(Approved)` in
//!   [`analytical_decide_approval`], reached from a deliberate operator action.
//! - **Consent/scope mint only from operator UI.** `ConsentRecord` /
//!   `SubjectScope` are minted in [`analytical_record_consent`] /
//!   [`analytical_assess_targeting`] from operator arguments — never from case
//!   content, never pre-filled from fetched text. A private individual as target
//!   is refused, permanently.
//!
//! What this module does NOT do (rider a/b, deliberately): it never drives the
//! six-phase collection machine (`AnalyticalCase`'s live tools) and never
//! enables the `investigative` feature. Collection/investigative mode is not
//! shipped in the beta — the surface here is the emission gate + honest
//! rendering + the approval/consent operator patterns.

use holmes_core::analysis::emission::{self, EmittedEvidencePack};
use holmes_core::artifacts::{
    BriefOrigin, Confidence, EvidencePack, Finding, Knowability, LimitsOfThisFinding, Provenance,
    ResearchBrief,
};
use holmes_core::analysis::CalibrationStatus;
use holmes_core::safety::approval::{ApprovalDecision, ApprovalProtocol, ToolDescriptor};
use holmes_core::safety::subjects::{assess_targeting, ConsentRecord, SubjectScope};
use serde::{Deserialize, Serialize};

// Rider (a), compiler-backed: the beta artifact carries the investigative
// surface ABSENT (D-14 rider a). holmes-core's own const is `true` only when the
// `investigative` feature is off; asserting it here breaks Alfred's build the
// instant anyone enables the feature on our dependency.
const _: () = assert!(
    holmes_core::observability::INVESTIGATIVE_ABSENT,
    "the investigative surface must stay absent from Alfred's beta build (D-14 rider a)"
);

// --- render DTOs (crate → UI), built only from an EmittedEvidencePack ----------

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceDto {
    pub source: String,
    pub quote: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FindingDto {
    pub claim: String,
    pub confidence: f64,
    pub provenance: Vec<ProvenanceDto>,
    pub valid_from: String,
    pub valid_until: Option<String>,
    pub is_current: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LimitsDto {
    pub what_would_change_the_conclusion: Vec<String>,
    pub what_could_not_be_checked: Vec<String>,
    pub where_the_evidence_runs_out: Vec<String>,
}

/// The full render surface of an emitted pack — every honesty field reaches the
/// UI (knowability, the three-part limits, the uncertainty statement, the
/// `[eliminated]` hypothesis labels). Nothing is truncated here.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EmittedPackDto {
    /// Present by construction — the DTO can only be built from an emitted pack.
    pub emitted: bool,
    pub question: String,
    pub findings: Vec<FindingDto>,
    /// Eliminated hypotheses arrive here as `[eliminated] …` strings (the
    /// crate's own labeling); rendered verbatim, never stripped.
    pub competing_hypotheses: Vec<String>,
    pub key_assumptions: Vec<String>,
    pub risk_flags: Vec<String>,
    pub recommendation: Option<String>,
    /// "high_validity" | "low_validity" — deterministic, never model-inferred.
    pub knowability: Option<String>,
    pub limits_of_this_finding: Option<LimitsDto>,
    pub uncertainty_statement: Option<String>,
}

impl EmittedPackDto {
    /// The ONLY constructor. Takes `&EmittedEvidencePack` — so a raw pack has no
    /// render path, and possessing a rendered DTO proves the gate passed.
    pub fn from_emitted(emitted: &EmittedEvidencePack) -> Self {
        let pack = emitted.pack();
        EmittedPackDto {
            emitted: true,
            question: pack.question().to_string(),
            findings: pack
                .findings()
                .iter()
                .map(|f| FindingDto {
                    claim: f.claim().to_string(),
                    confidence: f.confidence().value(),
                    provenance: f
                        .provenance()
                        .iter()
                        .map(|p| ProvenanceDto {
                            source: p.source.clone(),
                            quote: p.quote.clone(),
                        })
                        .collect(),
                    valid_from: f.valid_from().to_string(),
                    valid_until: f.valid_until().map(str::to_string),
                    is_current: f.is_current(),
                })
                .collect(),
            competing_hypotheses: pack.competing_hypotheses.clone(),
            key_assumptions: pack.key_assumptions.clone(),
            risk_flags: pack.risk_flags.clone(),
            recommendation: pack.recommendation.clone(),
            knowability: pack.knowability.map(|k| match k {
                Knowability::HighValidity => "high_validity".to_string(),
                Knowability::LowValidity => "low_validity".to_string(),
            }),
            limits_of_this_finding: pack.limits_of_this_finding.as_ref().map(|l| LimitsDto {
                what_would_change_the_conclusion: l.what_would_change_the_conclusion.clone(),
                what_could_not_be_checked: l.what_could_not_be_checked.clone(),
                where_the_evidence_runs_out: l.where_the_evidence_runs_out.clone(),
            }),
            uncertainty_statement: pack.uncertainty_statement.clone(),
        }
    }
}

// --- operator input DTOs (UI → crate constructors) -----------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceInput {
    pub source: String,
    pub quote: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindingInput {
    pub claim: String,
    pub confidence: f64,
    pub provenance: Vec<ProvenanceInput>,
    pub valid_from: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitsInput {
    #[serde(default)]
    pub what_would_change_the_conclusion: Vec<String>,
    #[serde(default)]
    pub what_could_not_be_checked: Vec<String>,
    #[serde(default)]
    pub where_the_evidence_runs_out: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmitCaseInput {
    /// Operator brief → ResearchBrief.question (the traceable chain root).
    pub question: String,
    #[serde(default)]
    pub scope: String,
    pub findings: Vec<FindingInput>,
    /// "high_validity" | "low_validity" — the operator's deterministic call.
    pub knowability: String,
    pub limits: LimitsInput,
    pub uncertainty_statement: Option<String>,
    #[serde(default)]
    pub competing_hypotheses: Vec<String>,
    #[serde(default)]
    pub key_assumptions: Vec<String>,
    #[serde(default)]
    pub recommendation: Option<String>,
}

/// The result of an emission attempt: an emitted pack, or the crate's honest
/// denial (surfaced verbatim so the UI renders the gate's reasoning).
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase", tag = "outcome")]
pub enum EmitOutcome {
    Emitted { pack: EmittedPackDto },
    Denied { reason: String, class: String },
}

fn parse_knowability(s: &str) -> Result<Knowability, String> {
    match s {
        "high_validity" => Ok(Knowability::HighValidity),
        "low_validity" => Ok(Knowability::LowValidity),
        other => Err(format!(
            "knowability must be \"high_validity\" or \"low_validity\", got {other:?}"
        )),
    }
}

/// operator brief → ResearchBrief → EvidencePack → **the crate emission gate**.
/// On success returns the rendered emitted pack; on a gate denial returns the
/// verbatim reason + its content-free class. Never renders a raw pack.
#[tauri::command]
pub fn analytical_emit(input: EmitCaseInput) -> Result<EmitOutcome, String> {
    // operator brief → ResearchBrief (the input artifact; question is the chain).
    let brief = ResearchBrief::new(&input.question, BriefOrigin::BuildTime, &input.scope, Vec::new())
        .map_err(|e| e.to_string())?;

    let knowability = parse_knowability(&input.knowability)?;

    // Build the pack through the crate constructors — invariant 5 (non-empty
    // provenance, bounded confidence) is enforced there, not here.
    let mut pack = EvidencePack::new(brief.question.clone()).map_err(|e| e.to_string())?;
    for fi in &input.findings {
        let confidence = Confidence::new(fi.confidence).map_err(|e| e.to_string())?;
        let mut prov = Vec::with_capacity(fi.provenance.len());
        for p in &fi.provenance {
            prov.push(Provenance::new(&p.source, p.quote.clone()).map_err(|e| e.to_string())?);
        }
        let finding = Finding::new(&fi.claim, confidence, prov, &fi.valid_from)
            .map_err(|e| e.to_string())?;
        pack.add_finding(finding);
    }
    pack.knowability = Some(knowability);
    pack.limits_of_this_finding = Some(LimitsOfThisFinding {
        what_would_change_the_conclusion: input.limits.what_would_change_the_conclusion.clone(),
        what_could_not_be_checked: input.limits.what_could_not_be_checked.clone(),
        where_the_evidence_runs_out: input.limits.where_the_evidence_runs_out.clone(),
    });
    pack.uncertainty_statement = input.uncertainty_statement.clone();
    pack.competing_hypotheses = input.competing_hypotheses.clone();
    pack.key_assumptions = input.key_assumptions.clone();
    pack.recommendation = input.recommendation.clone();

    // The gate. The analytical core only ever supplies Uncalibrated, so the
    // caller cannot talk the gate into leniency; we pass the same, honestly.
    match emission::emit(&pack, CalibrationStatus::Uncalibrated) {
        Ok(emitted) => Ok(EmitOutcome::Emitted {
            pack: EmittedPackDto::from_emitted(&emitted),
        }),
        Err(denial) => Ok(EmitOutcome::Denied {
            reason: denial.to_string(),
            class: denial.class().to_string(),
        }),
    }
}

// --- approval (2.5c): preview, then a grant mints only from operator Approved --

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInput {
    pub name: String,
    pub purpose: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalPreviewDto {
    pub case_id: String,
    pub request_id: usize,
    /// The deterministic preview text the operator reads before deciding.
    pub preview: String,
    pub tools: Vec<ToolPreviewDto>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolPreviewDto {
    pub name: String,
    pub purpose: String,
}

/// Stage a previewable approval request. Grants NOTHING — the request exists so
/// the operator can read it and decide. Rendering is Alfred's obligation; the
/// deny-by-default protocol is the crate's.
#[tauri::command]
pub fn analytical_preview_approval(
    case_id: String,
    tools: Vec<ToolInput>,
    requested_at: String,
) -> Result<ApprovalPreviewDto, String> {
    let mut protocol = ApprovalProtocol::new(&case_id);
    let mut descriptors = Vec::with_capacity(tools.len());
    for t in &tools {
        descriptors.push(ToolDescriptor::new(&t.name, &t.purpose).map_err(|e| e.to_string())?);
    }
    let id = protocol.request(descriptors, &requested_at).map_err(|e| e.to_string())?;
    let request = protocol
        .requests()
        .iter()
        .find(|r| r.id == id)
        .ok_or("staged request vanished")?;
    Ok(ApprovalPreviewDto {
        case_id: case_id.clone(),
        request_id: id.0,
        preview: request.preview(),
        tools: request
            .tools
            .iter()
            .map(|t| ToolPreviewDto {
                name: t.name().to_string(),
                purpose: t.purpose().to_string(),
            })
            .collect(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDecisionDto {
    /// How many grants were minted — nonzero ONLY on an explicit Approved.
    pub grants_minted: usize,
    pub decision: String,
    /// Born-redacted log: tool names + decision + timestamp, never content.
    pub log: Vec<ApprovalLogDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalLogDto {
    pub tool: String,
    pub decision: String,
    pub at: String,
}

/// Record the operator's deliberate decision on a previewed tool set. This is
/// the ONLY mint of a `ToolGrant` (Approved → one grant per tool; Denied → zero).
/// The grant is sealed in the crate — no path from any text produces one; this
/// command exists so a grant follows a visible preview and a deliberate click.
#[tauri::command]
pub fn analytical_decide_approval(
    case_id: String,
    tools: Vec<ToolInput>,
    approved: bool,
    decided_at: String,
) -> Result<ApprovalDecisionDto, String> {
    let mut protocol = ApprovalProtocol::new(&case_id);
    let mut descriptors = Vec::with_capacity(tools.len());
    for t in &tools {
        descriptors.push(ToolDescriptor::new(&t.name, &t.purpose).map_err(|e| e.to_string())?);
    }
    let id = protocol.request(descriptors, &decided_at).map_err(|e| e.to_string())?;
    let decision = if approved {
        ApprovalDecision::Approved
    } else {
        ApprovalDecision::Denied
    };
    let minted = protocol
        .record_decision(id, decision, &decided_at)
        .map_err(|e| e.to_string())?;
    Ok(ApprovalDecisionDto {
        grants_minted: minted,
        decision: if approved { "approved" } else { "denied" }.to_string(),
        log: protocol
            .log()
            .iter()
            .map(|e| ApprovalLogDto {
                tool: e.tool.clone(),
                decision: match e.decision {
                    ApprovalDecision::Approved => "approved".to_string(),
                    ApprovalDecision::Denied => "denied".to_string(),
                },
                at: e.at.clone(),
            })
            .collect(),
    })
}

// --- consent / subject scope (2.5d): minted only from operator UI --------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentDto {
    pub recorded: bool,
    pub reference: String,
}

/// Mint an operator-attested `ConsentRecord` from an explicit operator
/// reference (where the signed release lives). Never from case content, never
/// pre-filled from fetched text — the seal exists precisely so content cannot
/// launder authority. An empty reference is refused as a forgery.
#[tauri::command]
pub fn analytical_record_consent(reference: String) -> Result<ConsentDto, String> {
    let record = ConsentRecord::record(&reference).map_err(|e| e.to_string())?;
    Ok(ConsentDto {
        recorded: true,
        reference: record.reference().to_string(),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum SubjectScopeInput {
    #[serde(rename_all = "camelCase")]
    PowerStructure { name: String, role_note: String },
    #[serde(rename_all = "camelCase")]
    PrivateIndividual { descriptor: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetingDto {
    pub allowed: bool,
    pub reason: Option<String>,
}

/// Assess an operator-declared subject scope for investigative targeting.
/// A private individual is refused **permanently** (the crate has no override).
/// The scope is operator-declared, never model-inferred from case content.
#[tauri::command]
pub fn analytical_assess_targeting(scope: SubjectScopeInput) -> TargetingDto {
    let scope = match scope {
        SubjectScopeInput::PowerStructure { name, role_note } => {
            SubjectScope::PowerStructure { name, role_note }
        }
        SubjectScopeInput::PrivateIndividual { descriptor } => {
            SubjectScope::PrivateIndividual { descriptor }
        }
    };
    match assess_targeting(&scope) {
        Ok(_allowed) => TargetingDto {
            allowed: true,
            reason: None,
        },
        Err(refusal) => TargetingDto {
            allowed: false,
            reason: Some(refusal.to_string()),
        },
    }
}
