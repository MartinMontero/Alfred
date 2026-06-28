// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
//! Born-redacted local telemetry store (Phase 5 Step 3).
//!
//! Alfred's Rust core owns `telemetry.db`. This module is the **only** write path.
//! Born-redacted means redaction is **structural**: the [`TelemetryEvent`] type is
//! a typed allowlist — every field is a count, duration, boolean, enum, or stable
//! id/name. There is no column and no field for a note body, prompt, tool
//! argument, key, or file content, so such data **cannot** be written. The failure
//! mode of an allowlist is a missing benign field, never a leaked secret.
//!
//! Pure functions take a `Connection`/`Path` so they are unit-testable from cargo
//! (the byte-scan canary lives in `telemetry_tests.rs`). The Tauri command wrappers
//! that gate on the opt-in flag live in `lib.rs`.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Default rolling retention (matches goose's own convention).
pub const RETENTION_DAYS: i64 = 14;

/// The typed allowlist of recordable events. Internally tagged by `kind`; field
/// names are camelCase to match the TS event model across the IPC boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TelemetryEvent {
    #[serde(rename_all = "camelCase")]
    AgentTurn {
        turn_id: String,
        duration_ms: i64,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error_type: Option<String>,
        // W3C trace correlation (Step 4) — correlation ids only, never content.
        #[serde(skip_serializing_if = "Option::is_none")]
        trace_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        span_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    LlmRequest {
        model: String,
        provider: String,
        // Tokens are OPTIONAL — ACP usage is experimental; omit when absent, never emit 0.
        #[serde(skip_serializing_if = "Option::is_none")]
        input_tokens: Option<i64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        output_tokens: Option<i64>,
        duration_ms: i64,
        finish_reason: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        error_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        trace_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        span_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    ToolCall {
        tool: String,
        duration_ms: i64,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        mcp_method: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        trace_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        span_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    SchemaValidation {
        schema: String,
        rule: String,
        ok: bool,
    },
    #[serde(rename_all = "camelCase")]
    Reflection {
        outcome: String,
        duration_ms: i64,
    },
}

/// A stored event with its timestamp, for export.
#[derive(Debug, Serialize)]
pub struct StoredEvent {
    pub ts: i64,
    #[serde(flatten)]
    pub event: TelemetryEvent,
}

#[derive(Debug, Serialize)]
pub struct KindStat {
    pub kind: String,
    pub count: i64,
    pub avg_duration_ms: f64,
}

#[derive(Debug, Serialize)]
pub struct ErrorStat {
    pub error_type: String,
    pub count: i64,
}

/// Read-side aggregates (token usage, durations by kind, error counts).
#[derive(Debug, Serialize)]
pub struct Metrics {
    pub total_events: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub by_kind: Vec<KindStat>,
    pub errors: Vec<ErrorStat>,
}

/// Verifiable result of a wipe: the user-facing truth is row counts + compaction.
#[derive(Debug, Serialize)]
pub struct WipeResult {
    pub rows_before: i64,
    pub rows_after: i64,
    pub file_bytes: i64,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Open (creating if needed) the telemetry store with the security pragmas. A
/// fresh db is created with auto_vacuum=FULL + WAL before any table exists.
/// Plain tables only — no FTS (shadow tables leave forensic traces).
pub fn open_store(path: &Path) -> rusqlite::Result<Connection> {
    let fresh = !path.exists();
    let conn = Connection::open(path)?;
    if fresh {
        // auto_vacuum must be set before tables are created on an empty db.
        conn.execute_batch("PRAGMA auto_vacuum = FULL; PRAGMA journal_mode = WAL;")?;
    }
    // Per-connection / re-asserted each open.
    conn.execute_batch("PRAGMA secure_delete = ON; PRAGMA temp_store = MEMORY;")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS events (
            id            INTEGER PRIMARY KEY,
            ts            INTEGER NOT NULL,
            kind          TEXT NOT NULL,
            turn_id       TEXT,
            duration_ms   INTEGER,
            ok            INTEGER,
            error_type    TEXT,
            model         TEXT,
            provider      TEXT,
            input_tokens  INTEGER,
            output_tokens INTEGER,
            finish_reason TEXT,
            tool          TEXT,
            mcp_method    TEXT,
            schema        TEXT,
            rule          TEXT,
            outcome       TEXT,
            trace_id      TEXT,
            span_id       TEXT
        );",
    )?;
    // Migrate older dbs (created before Step 4) to add the correlation columns.
    ensure_column(&conn, "trace_id")?;
    ensure_column(&conn, "span_id")?;
    Ok(conn)
}

/// Idempotently add a TEXT column to `events` if it does not already exist.
fn ensure_column(conn: &Connection, col: &str) -> rusqlite::Result<()> {
    let exists: i64 = conn.query_row(
        "SELECT count(*) FROM pragma_table_info('events') WHERE name = ?1",
        params![col],
        |r| r.get(0),
    )?;
    if exists == 0 {
        conn.execute_batch(&format!("ALTER TABLE events ADD COLUMN {col} TEXT;"))?;
    }
    Ok(())
}

/// Insert one event — the only write path. Maps the typed event to ONLY the
/// allowlisted columns; there is no column for free text.
pub fn record(conn: &Connection, ev: &TelemetryEvent) -> rusqlite::Result<()> {
    let ts = now_ms();
    match ev {
        TelemetryEvent::AgentTurn { turn_id, duration_ms, ok, error_type, trace_id, span_id } => conn.execute(
            "INSERT INTO events (ts,kind,turn_id,duration_ms,ok,error_type,trace_id,span_id)
             VALUES (?1,'agent_turn',?2,?3,?4,?5,?6,?7)",
            params![ts, turn_id, duration_ms, *ok as i64, error_type, trace_id, span_id],
        )?,
        TelemetryEvent::LlmRequest {
            model, provider, input_tokens, output_tokens, duration_ms, finish_reason, error_type, trace_id, span_id,
        } => conn.execute(
            "INSERT INTO events (ts,kind,model,provider,input_tokens,output_tokens,duration_ms,finish_reason,error_type,trace_id,span_id)
             VALUES (?1,'llm_request',?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![ts, model, provider, input_tokens, output_tokens, duration_ms, finish_reason, error_type, trace_id, span_id],
        )?,
        TelemetryEvent::ToolCall { tool, duration_ms, ok, error_type, mcp_method, trace_id, span_id } => conn.execute(
            "INSERT INTO events (ts,kind,tool,duration_ms,ok,error_type,mcp_method,trace_id,span_id)
             VALUES (?1,'tool_call',?2,?3,?4,?5,?6,?7,?8)",
            params![ts, tool, duration_ms, *ok as i64, error_type, mcp_method, trace_id, span_id],
        )?,
        TelemetryEvent::SchemaValidation { schema, rule, ok } => conn.execute(
            "INSERT INTO events (ts,kind,schema,rule,ok) VALUES (?1,'schema_validation',?2,?3,?4)",
            params![ts, schema, rule, *ok as i64],
        )?,
        TelemetryEvent::Reflection { outcome, duration_ms } => conn.execute(
            "INSERT INTO events (ts,kind,outcome,duration_ms) VALUES (?1,'reflection',?2,?3)",
            params![ts, outcome, duration_ms],
        )?,
    };
    Ok(())
}

/// The SINGLE opt-in gate, shared by the Tauri command and the tests. Telemetry is
/// enabled only when settings.json has `telemetry_enabled: true` — None/false/absent
/// is OFF (deny-by-default). No decoy: the command reads this exact function.
pub fn is_enabled_from_settings(settings_json: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(settings_json)
        .ok()
        .and_then(|v| v.get("telemetry_enabled").and_then(|t| t.as_bool()))
        .unwrap_or(false)
}

/// Canonical gate + write: records ONLY when settings say enabled; returns whether
/// a row was written. This is the EXACT function the `telemetry_record` command
/// calls after opening the store, and the function the tests drive — one path.
pub fn record_gated(conn: &Connection, settings_json: &str, ev: &TelemetryEvent) -> rusqlite::Result<bool> {
    if !is_enabled_from_settings(settings_json) {
        return Ok(false);
    }
    record(conn, ev)?;
    Ok(true)
}

/// Drop events older than the retention window.
pub fn prune(conn: &Connection, retention_days: i64) -> rusqlite::Result<()> {
    let cutoff = now_ms() - retention_days * 24 * 60 * 60 * 1000;
    conn.execute("DELETE FROM events WHERE ts < ?1", params![cutoff])?;
    Ok(())
}

/// Honest wipe — WAL-safe. The final checkpoint matters: VACUUM in WAL rewrites
/// pages into the WAL, so a second TRUNCATE checkpoint is required.
pub fn wipe(conn: &Connection) -> rusqlite::Result<WipeResult> {
    let rows_before: i64 = conn.query_row("SELECT count(*) FROM events", [], |r| r.get(0))?;
    conn.execute_batch("PRAGMA secure_delete = ON;")?;
    conn.execute("DELETE FROM events", [])?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    conn.execute_batch("VACUUM;")?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    let rows_after: i64 = conn.query_row("SELECT count(*) FROM events", [], |r| r.get(0))?;
    Ok(WipeResult { rows_before, rows_after, file_bytes: 0 })
}

/// Read-side aggregations over the events table.
pub fn metrics(conn: &Connection) -> rusqlite::Result<Metrics> {
    let total_events: i64 = conn.query_row("SELECT count(*) FROM events", [], |r| r.get(0))?;
    let (input_tokens, output_tokens): (i64, i64) = conn.query_row(
        "SELECT coalesce(sum(input_tokens),0), coalesce(sum(output_tokens),0) FROM events",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    let mut by_kind = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT kind, count(*), coalesce(avg(duration_ms),0) FROM events GROUP BY kind ORDER BY kind",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(KindStat { kind: r.get(0)?, count: r.get(1)?, avg_duration_ms: r.get(2)? })
        })?;
        for row in rows {
            by_kind.push(row?);
        }
    }

    let mut errors = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT error_type, count(*) AS cnt FROM events WHERE error_type IS NOT NULL GROUP BY error_type ORDER BY cnt DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(ErrorStat { error_type: r.get(0)?, count: r.get(1)? })
        })?;
        for row in rows {
            errors.push(row?);
        }
    }

    Ok(Metrics { total_events, input_tokens, output_tokens, by_kind, errors })
}

const SELECT_COLS: &str = "ts,kind,turn_id,duration_ms,ok,error_type,model,provider,input_tokens,output_tokens,finish_reason,tool,mcp_method,schema,rule,outcome,trace_id,span_id";

/// Reconstruct a StoredEvent from a row selected with SELECT_COLS.
fn map_row(r: &rusqlite::Row) -> rusqlite::Result<StoredEvent> {
    let ts: i64 = r.get(0)?;
    let kind: String = r.get(1)?;
    let duration_ms: Option<i64> = r.get(3)?;
    let ok: Option<i64> = r.get(4)?;
    let error_type: Option<String> = r.get(5)?;
    let trace_id: Option<String> = r.get(16)?;
    let span_id: Option<String> = r.get(17)?;
    let event = match kind.as_str() {
        "agent_turn" => TelemetryEvent::AgentTurn {
            turn_id: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            duration_ms: duration_ms.unwrap_or(0),
            ok: ok.unwrap_or(0) != 0,
            error_type,
            trace_id,
            span_id,
        },
        "llm_request" => TelemetryEvent::LlmRequest {
            model: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
            provider: r.get::<_, Option<String>>(7)?.unwrap_or_default(),
            input_tokens: r.get(8)?,
            output_tokens: r.get(9)?,
            duration_ms: duration_ms.unwrap_or(0),
            finish_reason: r.get::<_, Option<String>>(10)?.unwrap_or_default(),
            error_type,
            trace_id,
            span_id,
        },
        "tool_call" => TelemetryEvent::ToolCall {
            tool: r.get::<_, Option<String>>(11)?.unwrap_or_default(),
            duration_ms: duration_ms.unwrap_or(0),
            ok: ok.unwrap_or(0) != 0,
            error_type,
            mcp_method: r.get(12)?,
            trace_id,
            span_id,
        },
        "schema_validation" => TelemetryEvent::SchemaValidation {
            schema: r.get::<_, Option<String>>(13)?.unwrap_or_default(),
            rule: r.get::<_, Option<String>>(14)?.unwrap_or_default(),
            ok: ok.unwrap_or(0) != 0,
        },
        _ => TelemetryEvent::Reflection {
            outcome: r.get::<_, Option<String>>(15)?.unwrap_or_else(|| "noop".into()),
            duration_ms: duration_ms.unwrap_or(0),
        },
    };
    Ok(StoredEvent { ts, event })
}

/// Reconstruct stored events (with timestamp) for export. Emits ONLY typed events
/// — it cannot reach any raw vault data.
pub fn export_rows(conn: &Connection) -> rusqlite::Result<Vec<StoredEvent>> {
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM events ORDER BY ts ASC, id ASC"))?;
    let rows = stmt.query_map([], map_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// All events sharing one trace id, in order — a session's correlated chain.
pub fn query_by_trace(conn: &Connection, trace_id: &str) -> rusqlite::Result<Vec<StoredEvent>> {
    let mut stmt =
        conn.prepare(&format!("SELECT {SELECT_COLS} FROM events WHERE trace_id = ?1 ORDER BY ts ASC, id ASC"))?;
    let rows = stmt.query_map(params![trace_id], map_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Live row count (for opt-in-inert and wipe assertions).
#[allow(dead_code)]
pub fn row_count(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT count(*) FROM events", [], |r| r.get(0))
}
