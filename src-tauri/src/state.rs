use crate::db::{migrations, repo::Repo};
use anyhow::{Context, Result};
use directories::ProjectDirs;
use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use tauri::AppHandle;

/// Shared application state. One connection lives inside a Mutex; for the
/// tracker-write / UI-read pattern at the volume we have, this is plenty.
/// If we outgrow it, swap in `r2d2_sqlite`.
pub struct AppState {
    pub _app: AppHandle,
    pub conn: Mutex<Connection>,
    pub db_path: PathBuf,
    /// Hot-path flag read every tick by the tracker so the UI can pause
    /// tracking without waiting on a DB round-trip.
    pub paused: AtomicBool,
    pub private_mode: AtomicBool,
}

impl AppState {
    pub fn initialize(app: AppHandle) -> Result<Self> {
        let db_path = resolve_db_path()?;
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("creating db dir {parent:?}"))?;
        }

        let mut conn = Connection::open(&db_path)
            .with_context(|| format!("opening sqlite at {db_path:?}"))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;

        migrations::apply(&mut conn).context("applying migrations")?;

        // First-run seeding: default exclusions (password managers, incognito,
        // etc.) are installed once. A user can delete any of them later and
        // they will not come back.
        {
            let repo = Repo::new(&conn);
            if repo.get_setting("initialized")?.is_none() {
                crate::privacy::seed_default_exclusions(&conn)?;
                repo.set_setting("initialized", "true")?;
                // Default to paused on first launch — the user opts in.
                repo.set_setting("tracking_paused", "true")?;
            }
        }

        // Load paused/private from settings (default: paused on first run so
        // the user explicitly opts in).
        let repo = Repo::new(&conn);
        let paused = repo
            .get_setting_bool("tracking_paused")?
            .unwrap_or(true);
        let private_mode = repo
            .get_setting_bool("private_mode")?
            .unwrap_or(false);

        Ok(Self {
            _app: app,
            conn: Mutex::new(conn),
            db_path,
            paused: AtomicBool::new(paused),
            private_mode: AtomicBool::new(private_mode),
        })
    }
}

fn resolve_db_path() -> Result<PathBuf> {
    // ~/.wrksight/wrksight.db by convention; falls back to ProjectDirs data dir.
    if let Some(home) = directories::BaseDirs::new().map(|b| b.home_dir().to_path_buf()) {
        return Ok(home.join(".wrksight").join("wrksight.db"));
    }
    let pd = ProjectDirs::from("com", "wrksight", "WRKSight")
        .context("cannot determine data directory")?;
    Ok(pd.data_dir().join("wrksight.db"))
}
