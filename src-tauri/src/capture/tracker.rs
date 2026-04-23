//! The continuously-running tracker loop.
//!
//! Responsibilities:
//!   * poll active window + idle state at the configured interval
//!   * apply the privacy filter *before* persisting
//!   * write raw events (one row per distinct window; extended while the
//!     foreground stays the same)
//!
//! It is intentionally dumb. Normalization and classification are done in
//! the TypeScript layer from stored rows.

use crate::capture::idle::{IdleProvider, SystemIdleProvider};
use crate::capture::window::{ActiveWinProvider, WindowProvider, WindowSnapshot};
use crate::db::repo::{RawEvent, Repo};
use crate::privacy::PrivacyFilter;
use crate::state::AppState;
use chrono::Utc;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

pub async fn run_forever(state: Arc<AppState>) {
    let window: Box<dyn WindowProvider> = Box::new(ActiveWinProvider);
    let idle: Box<dyn IdleProvider> = Box::new(SystemIdleProvider);
    run_with_providers(state, window.as_ref(), idle.as_ref()).await;
}

pub async fn run_with_providers(
    state: Arc<AppState>,
    window: &dyn WindowProvider,
    idle: &dyn IdleProvider,
) {
    let mut prev: Option<(i64, WindowSnapshot)> = None; // (raw_event_id, snapshot)
    loop {
        let (interval_ms, idle_threshold_ms) = {
            let conn = state.conn.lock();
            let repo = Repo::new(&conn);
            let i = repo
                .get_setting("capture_interval_ms")
                .ok()
                .flatten()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(5_000);
            let t = repo
                .get_setting("idle_threshold_ms")
                .ok()
                .flatten()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(180_000);
            (i, t)
        };

        tokio::time::sleep(Duration::from_millis(interval_ms)).await;

        if state.paused.load(Ordering::Relaxed) {
            // On resume, don't carry a dangling open session into the new state.
            prev = None;
            continue;
        }

        let idle_ms = idle.idle_for_ms().unwrap_or(0);
        let is_idle = idle_ms >= idle_threshold_ms;

        let snap = match window.current() {
            Ok(Some(s)) => s,
            _ => {
                prev = None;
                continue;
            }
        };

        let now_ms = Utc::now().timestamp_millis();
        let private = state.private_mode.load(Ordering::Relaxed);

        // Build the sample and run it through the privacy filter.
        let mut sample = RawEvent {
            id: None,
            started_at: now_ms,
            ended_at: None,
            app_name: snap.app_name.clone(),
            window_title: snap.window_title.clone(),
            browser_domain: snap.browser_domain.clone(),
            is_idle,
            is_private_window: private,
            normalized: false,
        };

        if private {
            sample = PrivacyFilter::redact_for_private_mode(sample);
        }

        let conn = state.conn.lock();
        let pf = match PrivacyFilter::load(&conn) {
            Ok(f) => f,
            Err(e) => {
                log::error!("privacy filter load failed: {e}");
                continue;
            }
        };
        if pf.should_exclude(&sample) {
            // Excluded inputs are NEVER written — even for duration accounting.
            // This is the core privacy guarantee.
            prev = None;
            continue;
        }

        let repo = Repo::new(&conn);

        match &prev {
            Some((prev_id, prev_snap))
                if prev_snap.app_name == snap.app_name
                    && prev_snap.window_title == snap.window_title =>
            {
                // Same foreground — extend the open event.
                let _ = repo.update_raw_ended_at(*prev_id, now_ms);
            }
            _ => {
                // Close prior (if any) and open new.
                if let Some((prev_id, _)) = prev.take() {
                    let _ = repo.update_raw_ended_at(prev_id, now_ms);
                }
                match repo.insert_raw(&sample) {
                    Ok(id) => prev = Some((id, snap)),
                    Err(e) => log::error!("raw insert failed: {e}"),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::window::WindowSnapshot;
    use anyhow::Result;
    use parking_lot::Mutex as PMutex;

    struct FakeWindow {
        script: PMutex<Vec<WindowSnapshot>>,
    }
    impl WindowProvider for FakeWindow {
        fn current(&self) -> Result<Option<WindowSnapshot>> {
            let mut s = self.script.lock();
            if s.is_empty() {
                Ok(None)
            } else {
                Ok(Some(s.remove(0)))
            }
        }
    }
    struct FakeIdle;
    impl IdleProvider for FakeIdle {
        fn idle_for_ms(&self) -> Result<u64> {
            Ok(0)
        }
    }

    // Compile-time check only — an actual run would need AppState which needs a
    // tauri handle. State wiring is covered by integration tests in CI.
    #[allow(dead_code)]
    fn _compiles(_w: &FakeWindow, _i: &FakeIdle) {}
}
