//! WRKSight Rust core.
//!
//! Responsibilities that live here and not in the UI:
//!   * owning the SQLite connection and schema migrations
//!   * running the activity-capture loop (window + idle sampling)
//!   * enforcing the privacy filter *before* any row is written
//!   * exposing a narrow, typed IPC surface to the webview

mod capture;
mod commands;
mod db;
mod privacy;
mod state;

use crate::state::AppState;
use std::sync::Arc;

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = Arc::new(AppState::initialize(app.handle().clone())?);
            app.manage(state.clone());

            // Launch the tracker in a background tokio task. It sleeps/wakes
            // based on the `tracking_paused` flag in app_settings and can be
            // toggled from the UI at any time.
            let tracker_state = state.clone();
            tauri::async_runtime::spawn(async move {
                capture::tracker::run_forever(tracker_state).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_setting,
            commands::set_tracking_paused,
            commands::set_private_mode,
            commands::list_exclusions,
            commands::add_exclusion,
            commands::remove_exclusion,
            commands::list_raw_events,
            commands::list_sessions,
            commands::upsert_session,
            commands::list_classifications,
            commands::upsert_classification,
            commands::list_summaries,
            commands::upsert_summary,
            commands::list_goals,
            commands::upsert_goal,
            commands::delete_goal,
            commands::list_accomplishments,
            commands::upsert_accomplishment,
            commands::delete_accomplishment,
            commands::purge_range,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WRKSight");
}
