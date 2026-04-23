//! Tauri commands exposed to the webview. Each is a narrow, typed surface.
//!
//! The UI never constructs SQL. All reads/writes go through `Repo`.

use crate::db::repo::{
    Accomplishment, Classification, Exclusion, Goal, NormalizedSession, RawEvent, Repo, Summary,
};
use crate::state::AppState;
use chrono::Utc;
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
