// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
//! Analytical-surface tests (Track 4). Pin the load-bearing invariants: the
//! emission gate actually runs through the artifact seam, its denials surface
//! verbatim, every honesty field reaches the DTO, and the sealed types mint
//! only from operator actions.

use crate::analytical::{
    analytical_assess_targeting, analytical_decide_approval, analytical_emit,
    analytical_preview_approval, analytical_record_consent, EmitCaseInput, EmitOutcome,
    FindingInput, LimitsInput, ProvenanceInput, SubjectScopeInput, ToolInput,
};

fn two_independent_provenance() -> Vec<ProvenanceInput> {
    vec![
        ProvenanceInput {
            source: "https://sec.gov/filing/123".into(),
            quote: Some("the filing states X".into()),
        },
        ProvenanceInput {
            source: "https://courtlistener.com/docket/456".into(),
            quote: Some("the docket records Y".into()),
        },
    ]
}

fn base_input() -> EmitCaseInput {
    EmitCaseInput {
        question: "Did the office misuse the fund?".into(),
        scope: "public office conduct".into(),
        findings: vec![FindingInput {
            claim: "the fund was redirected".into(),
            confidence: 0.6,
            provenance: two_independent_provenance(),
            valid_from: "2026-07-22".into(),
        }],
        knowability: "high_validity".into(),
        limits: LimitsInput {
            what_would_change_the_conclusion: vec!["a signed authorization for the transfer".into()],
            what_could_not_be_checked: vec!["internal emails not in the record".into()],
            where_the_evidence_runs_out: vec!["after the 2026 fiscal year".into()],
        },
        uncertainty_statement: None,
        competing_hypotheses: vec![
            "the transfer was authorized".into(),
            "[eliminated] the fund never existed".into(),
        ],
        key_assumptions: vec!["the filing is authentic".into()],
        recommendation: Some("route to a journalist for verification".into()),
    }
}

#[test]
fn emit_produces_a_rendered_pack_with_every_honesty_field() {
    let out = analytical_emit(base_input()).expect("command ok");
    match out {
        EmitOutcome::Emitted { pack } => {
            assert!(pack.emitted, "the DTO can only exist for an emitted pack");
            assert_eq!(pack.question, "Did the office misuse the fund?");
            assert_eq!(pack.findings.len(), 1);
            assert_eq!(pack.findings[0].provenance.len(), 2);
            // Honesty fields all reach the screen — untruncated.
            assert_eq!(pack.knowability.as_deref(), Some("high_validity"));
            let limits = pack.limits_of_this_finding.expect("limits present");
            assert_eq!(limits.what_would_change_the_conclusion.len(), 1);
            assert_eq!(limits.what_could_not_be_checked.len(), 1);
            assert_eq!(limits.where_the_evidence_runs_out.len(), 1);
            // The [eliminated] label reaches the UI verbatim, not stripped.
            assert!(pack
                .competing_hypotheses
                .iter()
                .any(|h| h.starts_with("[eliminated] ")));
            assert_eq!(pack.recommendation.as_deref(), Some("route to a journalist for verification"));
        }
        EmitOutcome::Denied { reason, .. } => panic!("expected emission, got denial: {reason}"),
    }
}

#[test]
fn emit_surfaces_the_uncorroborated_denial_verbatim() {
    // One provenance root → below the ≥2 independent-roots floor.
    let mut input = base_input();
    input.findings[0].provenance = vec![ProvenanceInput {
        source: "https://sec.gov/filing/123".into(),
        quote: Some("only one source".into()),
    }];
    match analytical_emit(input).expect("command ok") {
        EmitOutcome::Denied { reason, class } => {
            assert_eq!(class, "uncorroborated");
            assert!(reason.contains("independent"), "denial names the gate: {reason}");
        }
        EmitOutcome::Emitted { .. } => panic!("a single-root finding must be denied"),
    }
}

#[test]
fn emit_denies_confident_uncalibrated_and_names_the_remedy() {
    // Confidence at/above the floor → the calibration gate fires (the core only
    // ever supplies Uncalibrated), and the denial names the downgrade remedy.
    let mut input = base_input();
    input.findings[0].confidence = 0.9;
    match analytical_emit(input).expect("command ok") {
        EmitOutcome::Denied { reason, class } => {
            assert_eq!(class, "uncalibrated_confidence");
            assert!(reason.contains("calibration"), "{reason}");
        }
        EmitOutcome::Emitted { .. } => panic!("confident-uncalibrated must be denied"),
    }
}

#[test]
fn emit_denies_missing_limits() {
    let mut input = base_input();
    input.limits = LimitsInput {
        what_would_change_the_conclusion: vec![],
        what_could_not_be_checked: vec![],
        where_the_evidence_runs_out: vec![],
    };
    match analytical_emit(input).expect("command ok") {
        EmitOutcome::Denied { class, .. } => assert_eq!(class, "limits_missing"),
        EmitOutcome::Emitted { .. } => panic!("an empty limits statement must be denied"),
    }
}

#[test]
fn emit_rejects_out_of_range_confidence_at_construction() {
    let mut input = base_input();
    input.findings[0].confidence = 1.5;
    let err = analytical_emit(input).unwrap_err();
    assert!(err.contains("confidence"), "{err}");
}

#[test]
fn emit_rejects_a_finding_with_no_provenance() {
    let mut input = base_input();
    input.findings[0].provenance = vec![];
    let err = analytical_emit(input).unwrap_err();
    assert!(err.to_lowercase().contains("provenance"), "{err}");
}

// --- approval (2.5c) ----------------------------------------------------------

#[test]
fn preview_grants_nothing_and_shows_every_tool() {
    let preview = analytical_preview_approval(
        "case-1".into(),
        vec![
            ToolInput { name: "web.fetch".into(), purpose: "read a public filing".into() },
            ToolInput { name: "vault.write".into(), purpose: "record the finding".into() },
        ],
        "2026-07-22T00:00:00Z".into(),
    )
    .expect("preview ok");
    assert_eq!(preview.tools.len(), 2);
    assert!(preview.preview.contains("web.fetch"));
    assert!(preview.preview.contains("deny to grant nothing"));
}

#[test]
fn approved_mints_one_grant_per_tool_denied_mints_zero() {
    let approved = analytical_decide_approval(
        "case-1".into(),
        vec![
            ToolInput { name: "web.fetch".into(), purpose: "read".into() },
            ToolInput { name: "vault.write".into(), purpose: "record".into() },
        ],
        true,
        "2026-07-22T00:00:00Z".into(),
    )
    .expect("decision ok");
    assert_eq!(approved.grants_minted, 2);
    assert_eq!(approved.decision, "approved");
    assert_eq!(approved.log.len(), 2);

    let denied = analytical_decide_approval(
        "case-1".into(),
        vec![ToolInput { name: "web.fetch".into(), purpose: "read".into() }],
        false,
        "2026-07-22T00:00:00Z".into(),
    )
    .expect("decision ok");
    assert_eq!(denied.grants_minted, 0, "denied mints nothing");
}

#[test]
fn approval_rejects_a_smuggling_tool_name() {
    // Bounded vocabulary: uppercase / spaces / zero-width are refused.
    let err = analytical_preview_approval(
        "case-1".into(),
        vec![ToolInput { name: "Web Fetch".into(), purpose: "x".into() }],
        "t".into(),
    )
    .unwrap_err();
    assert!(err.contains("tool name"), "{err}");
}

// --- consent / targeting (2.5d) ----------------------------------------------

#[test]
fn consent_mints_only_from_a_nonempty_operator_reference() {
    let ok = analytical_record_consent("signed release in vault/legal/release-42.pdf".into())
        .expect("consent ok");
    assert!(ok.recorded);
    // An empty reference is the "no such record" forgery the seal blocks.
    assert!(analytical_record_consent("   ".into()).is_err());
}

#[test]
fn targeting_refuses_a_private_individual_permanently() {
    let power = analytical_assess_targeting(SubjectScopeInput::PowerStructure {
        name: "The Ministry".into(),
        role_note: "public office".into(),
    });
    assert!(power.allowed);

    let private = analytical_assess_targeting(SubjectScopeInput::PrivateIndividual {
        descriptor: "a named private citizen".into(),
    });
    assert!(!private.allowed, "a private individual as target is refused");
    assert!(private.reason.is_some());
}
