//! Tauri commands exposed to the webview. Each is a narrow, typed surface.
//!
//! The UI never constructs SQL. All reads/writes go through `Repo`.

use crate::db::repo::{
    Accomplishment, Classification, Exclusion, Goal, NormalizedSession, RawEvent, Repo, Summary,
};
use crate::state::AppState;
use chrono::Utc;
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::State;

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------- settings ----------

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> CmdResult<Vec<(String, String)>> {
    let conn = state.conn.lock();
    Repo::new(&conn).all_settings().map_err(err)
}

#[tauri::command]
pub fn set_setting(
    key: String,
    value: String,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<()> {
    let conn = state.conn.lock();
    Repo::new(&conn).set_setting(&key, &value).map_err(err)
}

#[tauri::command]
pub fn set_tracking_paused(paused: bool, state: State<'_, Arc<AppState>>) -> CmdResult<()> {
    state.paused.store(paused, Ordering::Relaxed);
    let conn = state.conn.lock();
    Repo::new(&conn)
        .set_setting("tracking_paused", if paused { "true" } else { "false" })
        .map_err(err)
}

#[tauri::command]
pub fn set_private_mode(private: bool, state: State<'_, Arc<AppState>>) -> CmdResult<()> {
    state.private_mode.store(private, Ordering::Relaxed);
    let conn = state.conn.lock();
    Repo::new(&conn)
        .set_setting("private_mode", if private { "true" } else { "false" })
        .map_err(err)
}

// ---------- exclusions ----------

#[tauri::command]
pub fn list_exclusions(state: State<'_, Arc<AppState>>) -> CmdResult<Vec<Exclusion>> {
    let conn = state.conn.lock();
    Repo::new(&conn).list_exclusions().map_err(err)
}

#[tauri::command]
pub fn add_exclusion(
    kind: String,
    value: String,
    note: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<i64> {
    let conn = state.conn.lock();
    Repo::new(&conn)
        .add_exclusion(&Exclusion { id: None, kind, value, note })
        .map_err(err)
}

#[tauri::command]
pub fn remove_exclusion(id: i64, state: State<'_, Arc<AppState>>) -> CmdResult<()> {
    let conn = state.conn.lock();
    Repo::new(&conn).remove_exclusion(id).map_err(err)
}

// ---------- raw / sessions / classifications ----------

#[tauri::command]
pub fn list_raw_events(
    since: i64,
    until: i64,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<Vec<RawEvent>> {
    let conn = state.conn.lock();
    Repo::new(&conn).list_raw(since, until).map_err(err)
}

#[tauri::command]
pub fn list_sessions(
    since: i64,
    until: i64,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<Vec<NormalizedSession>> {
    let conn = state.conn.lock();
    Repo::new(&conn).list_sessions(since, until).map_err(err)
}

#[tauri::command]
pub fn upsert_session(
    session: NormalizedSession,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<i64> {
    let conn = state.conn.lock();
    Repo::new(&conn).upsert_session(&session).map_err(err)
}

#[tauri::command]
pub fn list_classifications(
    since: i64,
    until: i64,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<Vec<Classification>> {
    let conn = state.conn.lock();
    Repo::new(&conn).list_classifications(since, until).map_err(err)
}

#[tauri::command]
pub fn upsert_classification(
    mut classification: Classification,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<i64> {
    if classification.created_at == 0 {
        classification.created_at = Utc::now().timestamp_millis();
    }
    let conn = state.conn.lock();
    Repo::new(&conn).upsert_classification(&classification).map_err(err)
}

// ---------- summaries ----------

#[tauri::command]
pub fn list_summaries(
    period_kind: String,
    since: i64,
    until: i64,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<Vec<Summary>> {
    let conn = state.conn.lock();
    Repo::new(&conn).list_summaries(&period_kind, since, until).map_err(err)
}

#[tauri::command]
pub fn upsert_summary(
    mut summary: Summary,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<i64> {
    if summary.created_at == 0 {
        summary.created_at = Utc::now().timestamp_millis();
    }
    let conn = state.conn.lock();
    Repo::new(&conn).upsert_summary(&summary).map_err(err)
}

// ---------- goals ----------

#[tauri::command]
pub fn list_goals(state: State<'_, Arc<AppState>>) -> CmdResult<Vec<Goal>> {
    let conn = state.conn.lock();
    Repo::new(&conn).list_goals().map_err(err)
}

#[tauri::command]
pub fn upsert_goal(mut goal: Goal, state: State<'_, Arc<AppState>>) -> CmdResult<i64> {
    if goal.created_at == 0 {
        goal.created_at = Utc::now().timestamp_millis();
    }
    let conn = state.conn.lock();
    Repo::new(&conn).upsert_goal(&goal).map_err(err)
}

#[tauri::command]
pub fn delete_goal(id: i64, state: State<'_, Arc<AppState>>) -> CmdResult<()> {
    let conn = state.conn.lock();
    Repo::new(&conn).delete_goal(id).map_err(err)
}

// ---------- accomplishments ----------

#[tauri::command]
pub fn list_accomplishments(state: State<'_, Arc<AppState>>) -> CmdResult<Vec<Accomplishment>> {
    let conn = state.conn.lock();
    Repo::new(&conn).list_accomplishments().map_err(err)
}

#[tauri::command]
pub fn upsert_accomplishment(
    mut accomplishment: Accomplishment,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<i64> {
    if accomplishment.created_at == 0 {
        accomplishment.created_at = Utc::now().timestamp_millis();
    }
    let conn = state.conn.lock();
    Repo::new(&conn).upsert_accomplishment(&accomplishment).map_err(err)
}

#[tauri::command]
pub fn delete_accomplishment(id: i64, state: State<'_, Arc<AppState>>) -> CmdResult<()> {
    let conn = state.conn.lock();
    Repo::new(&conn).delete_accomplishment(id).map_err(err)
}

// ---------- retention ----------

#[tauri::command]
pub fn purge_range(
    since: i64,
    until: i64,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<usize> {
    let conn = state.conn.lock();
    Repo::new(&conn).purge_range(since, until).map_err(err)
}

// ---------- normalization ----------

/// Atomically replaces every `normalized_sessions` row whose `started_at`
/// falls in `[since, until)` with the provided list. Used by the TS-side
/// normalization runner — the only path that creates session rows.
///
/// One transaction so a partial replace can never leave the dashboard
/// reading half-stale, half-fresh sessions.
#[tauri::command]
pub fn replace_sessions_in_range(
    since: i64,
    until: i64,
    sessions: Vec<NormalizedSession>,
    state: State<'_, Arc<AppState>>,
) -> CmdResult<usize> {
    let mut conn = state.conn.lock();
    let tx = conn.transaction().map_err(err)?;
    let removed: usize;
    let inserted: usize;
    {
        let repo = Repo::new(&tx);
        removed = repo.delete_sessions_in_range(since, until).map_err(err)?;
        let mut count = 0usize;
        for s in &sessions {
            // Force `id: None` on insert — caller never owns IDs for a
            // freshly normalized batch.
            let mut copy = s.clone();
            copy.id = None;
            repo.upsert_session(&copy).map_err(err)?;
            count += 1;
        }
        inserted = count;
    }
    tx.commit().map_err(err)?;
    log::debug!(
        "normalize: replaced {removed} → {inserted} sessions in [{since}, {until})"
    );
    Ok(inserted)
}

// ---------- diagnostics ----------

#[derive(Debug, Serialize)]
pub struct Diagnostics {
    pub paused: bool,
    pub private_mode: bool,
    pub platform: String,
    pub db_path: String,

    /// Wall-clock millis of the last tracker iteration (0 if loop never ran).
    pub last_tick_at: i64,
    /// Wall-clock millis of the last successful capture (0 if never).
    pub last_capture_at: i64,
    /// Most recent capture-side error, cleared on next success.
    pub last_capture_error: Option<String>,

    pub last_raw_event: Option<RawEvent>,
    pub latest_session: Option<NormalizedSession>,

    pub raw_count_today: i64,
    pub session_count_today: i64,
    pub raw_count_total: i64,
    pub session_count_total: i64,
}

#[tauri::command]
pub fn get_diagnostics(state: State<'_, Arc<AppState>>) -> CmdResult<Diagnostics> {
    let now = Utc::now();
    // Compute today's [start, end) in local time millis. We use UTC here
    // because the rest of the pipeline uses UTC millis; the dashboard does
    // its own local-time framing. For diagnostics this is good enough.
    let day_start = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .map(|d| d.and_utc().timestamp_millis())
        .unwrap_or(0);
    let day_end = day_start + 86_400_000;

    let paused = state.paused.load(Ordering::Relaxed);
    let private_mode = state.private_mode.load(Ordering::Relaxed);
    let last_tick_at = state.last_tick_at.load(Ordering::Relaxed);
    let last_capture_at = state.last_capture_at.load(Ordering::Relaxed);
    let last_capture_error = state.last_capture_error.lock().clone();

    let conn = state.conn.lock();
    let repo = Repo::new(&conn);

    let last_raw_event = repo.latest_raw().map_err(err)?;
    let latest_session = repo.latest_session().map_err(err)?;
    let raw_count_today = repo.count_raw_in_range(day_start, day_end).map_err(err)?;
    let session_count_today = repo
        .count_sessions_in_range(day_start, day_end)
        .map_err(err)?;
    let raw_count_total = repo
        .count_raw_in_range(0, i64::MAX)
        .map_err(err)?;
    let session_count_total = repo
        .count_sessions_in_range(0, i64::MAX)
        .map_err(err)?;

    Ok(Diagnostics {
        paused,
        private_mode,
        platform: std::env::consts::OS.to_string(),
        db_path: state.db_path.display().to_string(),
        last_tick_at,
        last_capture_at,
        last_capture_error,
        last_raw_event,
        latest_session,
        raw_count_today,
        session_count_today,
        raw_count_total,
        session_count_total,
    })
}
