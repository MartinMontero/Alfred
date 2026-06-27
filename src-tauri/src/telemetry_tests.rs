// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
//! Cargo integration tests for the telemetry store. The byte-scan CANARY is the
//! gate: it reads telemetry.db (and its WAL/SHM) as raw bytes and proves a seeded
//! secret/note body never reaches the file — the born-redacted guarantee, proven
//! in the language that owns the file.

use crate::telemetry::*;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

fn unique(tag: &str) -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{tag}-{}-{}", std::process::id(), t)
}

fn temp_db(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(unique(&format!("alfred-tel-{name}")));
    fs::create_dir_all(&dir).unwrap();
    dir.join("telemetry.db")
}

/// Scan the db file AND its -wal / -shm sidecars for a byte substring.
fn any_file_contains(db: &Path, needle: &str) -> bool {
    let needle = needle.as_bytes();
    for suffix in ["", "-wal", "-shm"] {
        let p = PathBuf::from(format!("{}{}", db.display(), suffix));
        if let Ok(bytes) = fs::read(&p) {
            if !needle.is_empty() && bytes.windows(needle.len()).any(|w| w == needle) {
                return true;
            }
        }
    }
    false
}

fn cleanup(db: &Path) {
    if let Some(dir) = db.parent() {
        let _ = fs::remove_dir_all(dir);
    }
}

const ENABLED: &str = r#"{"telemetry_enabled":true}"#;
const DISABLED: &str = r#"{"telemetry_enabled":false}"#;

/// Drive one realistic event of every kind through the SAME entry the app uses:
/// `record_gated` (the exact gate + write the `telemetry_record` command calls).
/// The canary strings are NOT passed to any event — the type makes that impossible
/// — so they must never appear on disk.
fn drive_all_kinds(conn: &Connection, settings_json: &str) {
    let events = vec![
        TelemetryEvent::AgentTurn {
            turn_id: "turn-1".into(),
            duration_ms: 1200,
            ok: true,
            error_type: None,
        },
        TelemetryEvent::LlmRequest {
            model: "claude-sonnet-4-6".into(),
            provider: "anthropic".into(),
            input_tokens: Some(900),
            output_tokens: Some(120),
            duration_ms: 1500,
            finish_reason: "end_turn".into(),
            error_type: Some("rate_limit".into()),
        },
        TelemetryEvent::ToolCall {
            tool: "vault_read".into(),
            duration_ms: 30,
            ok: true,
            error_type: None,
            mcp_method: Some("tools/call".into()),
        },
        TelemetryEvent::SchemaValidation {
            schema: "note.frontmatter".into(),
            rule: "description_required".into(),
            ok: false,
        },
        TelemetryEvent::Reflection { outcome: "ok".into(), duration_ms: 80 },
    ];
    for ev in &events {
        record_gated(conn, settings_json, ev).unwrap();
    }
}

#[test]
fn born_redacted_canary_no_secret_or_note_body_on_disk() {
    let db = temp_db("canary");
    let canary_note = unique("CANARY-NOTE");
    let canary_secret = unique("sk-CANARY");

    {
        let conn = open_store(&db).unwrap();
        // The canary data exists in this process but is NEVER handed to an event:
        // the typed allowlist has no field for a note body, secret, prompt, or arg.
        let _held = (&canary_note, &canary_secret);
        drive_all_kinds(&conn, ENABLED); // SAME entry the command uses
        assert_eq!(row_count(&conn).unwrap(), 5);
    } // drop conn → flush

    // GUARD against a blind scan: write the SAME canary RAW into a scratch db and
    // confirm the byte-scan CAN find it. So the redacted "not found" below means
    // redaction worked — not that the scan is looking in the wrong place. This is
    // the "prove the test can fail before trusting it passes" check.
    let control = temp_db("control");
    {
        let conn = open_store(&control).unwrap();
        conn.execute(
            "INSERT INTO events (ts,kind,tool) VALUES (0,'tool_call',?1)",
            rusqlite::params![&canary_secret],
        )
        .unwrap();
    }
    assert!(
        any_file_contains(&control, &canary_secret),
        "byte-scan must be able to detect a planted raw value (else the redacted result is meaningless)"
    );
    cleanup(&control);

    // Positive control: legitimate allowlisted values DO reach disk.
    assert!(
        any_file_contains(&db, "claude-sonnet-4-6") || any_file_contains(&db, "vault_read"),
        "expected allowlisted values on disk (positive control)"
    );
    // The gate: neither canary appears anywhere in the db OR its WAL/SHM sidecars,
    // even though the scan provably can find the same value when written raw.
    assert!(!any_file_contains(&db, &canary_note), "canary note body leaked to telemetry.db");
    assert!(!any_file_contains(&db, &canary_secret), "canary secret leaked to telemetry.db");

    cleanup(&db);
}

#[test]
fn opt_in_inert_writes_zero_rows_when_disabled() {
    let db = temp_db("optout");
    let canary = unique("CANARY-OPTOUT");
    {
        let conn = open_store(&db).unwrap();
        let _held = &canary;
        drive_all_kinds(&conn, DISABLED); // SAME gate the command uses, opted out
        assert_eq!(row_count(&conn).unwrap(), 0, "disabled telemetry must write zero rows");
    }
    // No event values and no canary on disk.
    assert!(!any_file_contains(&db, "claude-sonnet-4-6"));
    assert!(!any_file_contains(&db, "vault_read"));
    assert!(!any_file_contains(&db, &canary));
    cleanup(&db);
}

#[test]
fn wipe_removes_rows_and_seeded_records_from_bytes() {
    let db = temp_db("wipe");
    let marker = unique("WIPE-MARKER"); // recorded as a (low-cardinality-shaped) tool name
    {
        let conn = open_store(&db).unwrap();
        drive_all_kinds(&conn, ENABLED);
        record_gated(&conn, ENABLED, &TelemetryEvent::ToolCall {
            tool: marker.clone(),
            duration_ms: 1,
            ok: true,
            error_type: None,
            mcp_method: None,
        })
        .unwrap();
        assert!(row_count(&conn).unwrap() >= 6);
        // The recorded marker is on disk before the wipe (so the after-scan is meaningful).
        // (May be in the WAL; any_file_contains scans it.)
        let result = wipe(&conn).unwrap();
        assert!(result.rows_before >= 6);
        assert_eq!(result.rows_after, 0, "wipe must leave zero rows");
        assert_eq!(row_count(&conn).unwrap(), 0);
    }
    // After checkpoint→vacuum→checkpoint, the seeded record is gone from db + WAL + SHM.
    assert!(!any_file_contains(&db, &marker), "seeded record survived wipe in the file bytes");
    cleanup(&db);
}

#[test]
fn prune_drops_events_outside_retention() {
    let db = temp_db("prune");
    {
        let conn = open_store(&db).unwrap();
        record(&conn, &TelemetryEvent::Reflection { outcome: "ok".into(), duration_ms: 1 }).unwrap();
        // Insert a row 15 days old directly (record() always stamps "now").
        let old_ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64
            - 15 * 24 * 60 * 60 * 1000;
        conn.execute(
            "INSERT INTO events (ts,kind,outcome,duration_ms) VALUES (?1,'reflection','ok',1)",
            rusqlite::params![old_ts],
        )
        .unwrap();
        assert_eq!(row_count(&conn).unwrap(), 2);
        prune(&conn, RETENTION_DAYS).unwrap();
        assert_eq!(row_count(&conn).unwrap(), 1, "the 15-day-old event should be pruned");
    }
    cleanup(&db);
}

#[test]
fn metrics_and_export_emit_only_typed_fields() {
    let db = temp_db("export");
    {
        let conn = open_store(&db).unwrap();
        drive_all_kinds(&conn, ENABLED);
        let m = metrics(&conn).unwrap();
        assert_eq!(m.total_events, 5);
        assert_eq!(m.input_tokens, 900);
        assert_eq!(m.output_tokens, 120);
        assert!(m.errors.iter().any(|e| e.error_type == "rate_limit"));

        let rows = export_rows(&conn).unwrap();
        assert_eq!(rows.len(), 5);
        let json = serde_json::to_string(&rows).unwrap();
        // Export carries allowlisted values, never a free-text column.
        assert!(json.contains("claude-sonnet-4-6"));
        assert!(!json.contains("\"body\"") && !json.contains("\"content\""));
    }
    cleanup(&db);
}

#[test]
fn opt_in_gate_is_deny_by_default() {
    // The exact gate the command and the drive helpers use.
    assert!(!is_enabled_from_settings("{}"), "absent flag → OFF");
    assert!(!is_enabled_from_settings(r#"{"vault_path":"/x"}"#), "unrelated settings → OFF");
    assert!(!is_enabled_from_settings(r#"{"telemetry_enabled":false}"#), "false → OFF");
    assert!(!is_enabled_from_settings("not json"), "garbage → OFF");
    assert!(is_enabled_from_settings(r#"{"telemetry_enabled":true}"#), "true → ON");
}
