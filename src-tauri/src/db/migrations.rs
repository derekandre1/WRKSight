use anyhow::Result;
use rusqlite::Connection;

/// Forward-only migrations. Each migration is idempotent in that we track
/// `user_version` and only apply migrations greater than the current version.
pub fn apply(conn: &mut Connection) -> Result<()> {
    let current: i64 =
        conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap_or(0);

    let tx = conn.transaction()?;
    for (version, sql) in MIGRATIONS {
        if *version > current {
            tx.execute_batch(sql)?;
            tx.pragma_update(None, "user_version", version)?;
        }
    }
    tx.commit()?;
    Ok(())
}

const MIGRATIONS: &[(i64, &str)] = &[
    (
        1,
        r#"
        CREATE TABLE raw_activity_events (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at       INTEGER NOT NULL,
            ended_at         INTEGER,
            app_name         TEXT    NOT NULL,
            window_title     TEXT    NOT NULL DEFAULT '',
            browser_domain   TEXT,
            is_idle          INTEGER NOT NULL DEFAULT 0,
            is_private_window INTEGER NOT NULL DEFAULT 0,
            normalized       INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_raw_started_at ON raw_activity_events(started_at);
        CREATE INDEX idx_raw_normalized ON raw_activity_events(normalized, started_at);

        CREATE TABLE normalized_sessions (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at            INTEGER NOT NULL,
            ended_at              INTEGER NOT NULL,
            duration_ms           INTEGER NOT NULL,
            app_name              TEXT    NOT NULL,
            title_root            TEXT    NOT NULL DEFAULT '',
            browser_domain        TEXT,
            interruption_count    INTEGER NOT NULL DEFAULT 0,
            context_switch_count  INTEGER NOT NULL DEFAULT 0,
            source_event_ids_json TEXT    NOT NULL DEFAULT '[]',
            classified            INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_sess_started_at ON normalized_sessions(started_at);
        CREATE INDEX idx_sess_classified ON normalized_sessions(classified, started_at);

        CREATE TABLE ai_classifications (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      INTEGER NOT NULL UNIQUE
                REFERENCES normalized_sessions(id) ON DELETE CASCADE,
            project         TEXT,
            task            TEXT,
            category        TEXT    NOT NULL,
            strategic_score REAL    NOT NULL,
            reactive_score  REAL    NOT NULL,
            confidence      REAL    NOT NULL,
            model           TEXT    NOT NULL,
            created_at      INTEGER NOT NULL
        );

        CREATE TABLE summaries (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            period_kind    TEXT    NOT NULL, -- 'day' | 'week' | 'month'
            period_start   INTEGER NOT NULL,
            period_end     INTEGER NOT NULL,
            variant        TEXT    NOT NULL DEFAULT 'standard',
            text           TEXT    NOT NULL,
            structured_json TEXT   NOT NULL DEFAULT '{}',
            model          TEXT    NOT NULL,
            created_at     INTEGER NOT NULL,
            UNIQUE(period_kind, period_start, variant)
        );

        CREATE TABLE goals (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            label         TEXT    NOT NULL,
            direction     TEXT    NOT NULL,    -- 'increase' | 'decrease'
            target_kind   TEXT    NOT NULL,    -- 'category' | 'project' | 'strategic' | 'reactive'
            target_value  TEXT,
            target_hours  REAL,
            active        INTEGER NOT NULL DEFAULT 1,
            created_at    INTEGER NOT NULL
        );

        CREATE TABLE accomplishments (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            title          TEXT    NOT NULL,
            description    TEXT    NOT NULL DEFAULT '',
            evidence_json  TEXT    NOT NULL DEFAULT '{}',
            occurred_on    INTEGER NOT NULL,
            source         TEXT    NOT NULL DEFAULT 'user',
            created_at     INTEGER NOT NULL
        );

        CREATE TABLE exclusions (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            kind   TEXT NOT NULL,              -- 'app' | 'domain' | 'title_glob'
            value  TEXT NOT NULL,
            note   TEXT,
            UNIQUE(kind, value)
        );

        CREATE TABLE app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    ),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_is_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply(&mut conn).unwrap();
        apply(&mut conn).unwrap(); // second run must be a no-op
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 1);
    }

    #[test]
    fn core_tables_exist() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply(&mut conn).unwrap();
        for t in [
            "raw_activity_events",
            "normalized_sessions",
            "ai_classifications",
            "summaries",
            "goals",
            "accomplishments",
            "exclusions",
            "app_settings",
        ] {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [t],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(exists, 1, "missing table {t}");
        }
    }
}
