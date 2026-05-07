//! Thin repository over rusqlite. Each function takes a borrowed `Connection`
//! so the caller controls transactions.

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawEvent {
    pub id: Option<i64>,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub app_name: String,
    pub window_title: String,
    pub browser_domain: Option<String>,
    pub is_idle: bool,
    pub is_private_window: bool,
    pub normalized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exclusion {
    pub id: Option<i64>,
    pub kind: String,
    pub value: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedSession {
    pub id: Option<i64>,
    pub started_at: i64,
    pub ended_at: i64,
    pub duration_ms: i64,
    pub app_name: String,
    pub title_root: String,
    pub browser_domain: Option<String>,
    pub interruption_count: i64,
    pub context_switch_count: i64,
    pub source_event_ids_json: String,
    pub classified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Classification {
    pub id: Option<i64>,
    pub session_id: i64,
    pub project: Option<String>,
    pub task: Option<String>,
    pub category: String,
    pub strategic_score: f64,
    pub reactive_score: f64,
    pub confidence: f64,
    pub model: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    pub id: Option<i64>,
    pub period_kind: String,
    pub period_start: i64,
    pub period_end: i64,
    pub variant: String,
    pub text: String,
    pub structured_json: String,
    pub model: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    pub id: Option<i64>,
    pub label: String,
    pub direction: String,
    pub target_kind: String,
    pub target_value: Option<String>,
    pub target_hours: Option<f64>,
    pub active: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Accomplishment {
    pub id: Option<i64>,
    pub title: String,
    pub description: String,
    pub evidence_json: String,
    pub occurred_on: i64,
    pub source: String,
    pub created_at: i64,
}

pub struct Repo<'a> {
    conn: &'a Connection,
}

impl<'a> Repo<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    // ---------- settings ----------

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                [key],
                |r| r.get::<_, String>(0),
            )
            .optional()?)
    }

    pub fn get_setting_bool(&self, key: &str) -> Result<Option<bool>> {
        Ok(self.get_setting(key)?.map(|v| v == "true"))
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn all_settings(&self) -> Result<Vec<(String, String)>> {
        let mut st = self.conn.prepare("SELECT key, value FROM app_settings")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    // ---------- exclusions ----------

    pub fn list_exclusions(&self) -> Result<Vec<Exclusion>> {
        let mut st = self
            .conn
            .prepare("SELECT id, kind, value, note FROM exclusions ORDER BY kind, value")?;
        let rows = st.query_map([], |r| {
            Ok(Exclusion {
                id: Some(r.get(0)?),
                kind: r.get(1)?,
                value: r.get(2)?,
                note: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn add_exclusion(&self, e: &Exclusion) -> Result<i64> {
        self.conn.execute(
            "INSERT OR IGNORE INTO exclusions(kind, value, note) VALUES(?1, ?2, ?3)",
            params![e.kind, e.value, e.note],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn remove_exclusion(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM exclusions WHERE id = ?1", [id])?;
        Ok(())
    }

    // ---------- raw events ----------

    pub fn insert_raw(&self, e: &RawEvent) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO raw_activity_events
             (started_at, ended_at, app_name, window_title, browser_domain,
              is_idle, is_private_window, normalized)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
            params![
                e.started_at,
                e.ended_at,
                e.app_name,
                e.window_title,
                e.browser_domain,
                e.is_idle as i64,
                e.is_private_window as i64,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update_raw_ended_at(&self, id: i64, ended_at: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE raw_activity_events SET ended_at = ?1 WHERE id = ?2",
            params![ended_at, id],
        )?;
        Ok(())
    }

    pub fn list_raw(&self, since: i64, until: i64) -> Result<Vec<RawEvent>> {
        let mut st = self.conn.prepare(
            "SELECT id, started_at, ended_at, app_name, window_title, browser_domain,
                    is_idle, is_private_window, normalized
             FROM raw_activity_events
             WHERE started_at >= ?1 AND started_at < ?2
             ORDER BY started_at",
        )?;
        let rows = st.query_map([since, until], |r| {
            Ok(RawEvent {
                id: Some(r.get(0)?),
                started_at: r.get(1)?,
                ended_at: r.get(2)?,
                app_name: r.get(3)?,
                window_title: r.get(4)?,
                browser_domain: r.get(5)?,
                is_idle: r.get::<_, i64>(6)? != 0,
                is_private_window: r.get::<_, i64>(7)? != 0,
                normalized: r.get::<_, i64>(8)? != 0,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    // ---------- normalized sessions ----------

    pub fn upsert_session(&self, s: &NormalizedSession) -> Result<i64> {
        if let Some(id) = s.id {
            self.conn.execute(
                "UPDATE normalized_sessions SET
                   started_at=?1, ended_at=?2, duration_ms=?3, app_name=?4, title_root=?5,
                   browser_domain=?6, interruption_count=?7, context_switch_count=?8,
                   source_event_ids_json=?9, classified=?10
                 WHERE id=?11",
                params![
                    s.started_at,
                    s.ended_at,
                    s.duration_ms,
                    s.app_name,
                    s.title_root,
                    s.browser_domain,
                    s.interruption_count,
                    s.context_switch_count,
                    s.source_event_ids_json,
                    s.classified as i64,
                    id,
                ],
            )?;
            Ok(id)
        } else {
            self.conn.execute(
                "INSERT INTO normalized_sessions
                   (started_at, ended_at, duration_ms, app_name, title_root, browser_domain,
                    interruption_count, context_switch_count, source_event_ids_json, classified)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    s.started_at,
                    s.ended_at,
                    s.duration_ms,
                    s.app_name,
                    s.title_root,
                    s.browser_domain,
                    s.interruption_count,
                    s.context_switch_count,
                    s.source_event_ids_json,
                    s.classified as i64,
                ],
            )?;
            Ok(self.conn.last_insert_rowid())
        }
    }

    pub fn list_sessions(&self, since: i64, until: i64) -> Result<Vec<NormalizedSession>> {
        let mut st = self.conn.prepare(
            "SELECT id, started_at, ended_at, duration_ms, app_name, title_root, browser_domain,
                    interruption_count, context_switch_count, source_event_ids_json, classified
             FROM normalized_sessions
             WHERE started_at >= ?1 AND started_at < ?2
             ORDER BY started_at",
        )?;
        let rows = st.query_map([since, until], |r| {
            Ok(NormalizedSession {
                id: Some(r.get(0)?),
                started_at: r.get(1)?,
                ended_at: r.get(2)?,
                duration_ms: r.get(3)?,
                app_name: r.get(4)?,
                title_root: r.get(5)?,
                browser_domain: r.get(6)?,
                interruption_count: r.get(7)?,
                context_switch_count: r.get(8)?,
                source_event_ids_json: r.get(9)?,
                classified: r.get::<_, i64>(10)? != 0,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    // ---------- classifications ----------

    pub fn upsert_classification(&self, c: &Classification) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO ai_classifications
               (session_id, project, task, category, strategic_score, reactive_score,
                confidence, model, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(session_id) DO UPDATE SET
               project=excluded.project,
               task=excluded.task,
               category=excluded.category,
               strategic_score=excluded.strategic_score,
               reactive_score=excluded.reactive_score,
               confidence=excluded.confidence,
               model=excluded.model,
               created_at=excluded.created_at",
            params![
                c.session_id,
                c.project,
                c.task,
                c.category,
                c.strategic_score,
                c.reactive_score,
                c.confidence,
                c.model,
                c.created_at,
            ],
        )?;
        // mark session classified
        self.conn.execute(
            "UPDATE normalized_sessions SET classified = 1 WHERE id = ?1",
            [c.session_id],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn list_classifications(&self, since: i64, until: i64) -> Result<Vec<Classification>> {
        let mut st = self.conn.prepare(
            "SELECT c.id, c.session_id, c.project, c.task, c.category,
                    c.strategic_score, c.reactive_score, c.confidence, c.model, c.created_at
             FROM ai_classifications c
             JOIN normalized_sessions s ON s.id = c.session_id
             WHERE s.started_at >= ?1 AND s.started_at < ?2
             ORDER BY s.started_at",
        )?;
        let rows = st.query_map([since, until], |r| {
            Ok(Classification {
                id: Some(r.get(0)?),
                session_id: r.get(1)?,
                project: r.get(2)?,
                task: r.get(3)?,
                category: r.get(4)?,
                strategic_score: r.get(5)?,
                reactive_score: r.get(6)?,
                confidence: r.get(7)?,
                model: r.get(8)?,
                created_at: r.get(9)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    // ---------- summaries ----------

    pub fn upsert_summary(&self, s: &Summary) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO summaries
               (period_kind, period_start, period_end, variant, text, structured_json, model, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
             ON CONFLICT(period_kind, period_start, variant) DO UPDATE SET
               period_end=excluded.period_end,
               text=excluded.text,
               structured_json=excluded.structured_json,
               model=excluded.model,
               created_at=excluded.created_at",
            params![
                s.period_kind,
                s.period_start,
                s.period_end,
                s.variant,
                s.text,
                s.structured_json,
                s.model,
                s.created_at,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn list_summaries(
        &self,
        period_kind: &str,
        since: i64,
        until: i64,
    ) -> Result<Vec<Summary>> {
        let mut st = self.conn.prepare(
            "SELECT id, period_kind, period_start, period_end, variant, text, structured_json, model, created_at
             FROM summaries
             WHERE period_kind = ?1 AND period_start >= ?2 AND period_start < ?3
             ORDER BY period_start",
        )?;
        let rows = st.query_map(params![period_kind, since, until], |r| {
            Ok(Summary {
                id: Some(r.get(0)?),
                period_kind: r.get(1)?,
                period_start: r.get(2)?,
                period_end: r.get(3)?,
                variant: r.get(4)?,
                text: r.get(5)?,
                structured_json: r.get(6)?,
                model: r.get(7)?,
                created_at: r.get(8)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    // ---------- goals ----------

    pub fn list_goals(&self) -> Result<Vec<Goal>> {
        let mut st = self.conn.prepare(
            "SELECT id, label, direction, target_kind, target_value, target_hours, active, created_at
             FROM goals ORDER BY created_at DESC",
        )?;
        let rows = st.query_map([], |r| {
            Ok(Goal {
                id: Some(r.get(0)?),
                label: r.get(1)?,
                direction: r.get(2)?,
                target_kind: r.get(3)?,
                target_value: r.get(4)?,
                target_hours: r.get(5)?,
                active: r.get::<_, i64>(6)? != 0,
                created_at: r.get(7)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn upsert_goal(&self, g: &Goal) -> Result<i64> {
        if let Some(id) = g.id {
            self.conn.execute(
                "UPDATE goals SET label=?1, direction=?2, target_kind=?3, target_value=?4,
                 target_hours=?5, active=?6 WHERE id=?7",
                params![
                    g.label,
                    g.direction,
                    g.target_kind,
                    g.target_value,
                    g.target_hours,
                    g.active as i64,
                    id
                ],
            )?;
            Ok(id)
        } else {
            self.conn.execute(
                "INSERT INTO goals(label, direction, target_kind, target_value, target_hours, active, created_at)
                 VALUES(?1,?2,?3,?4,?5,?6,?7)",
                params![
                    g.label,
                    g.direction,
                    g.target_kind,
                    g.target_value,
                    g.target_hours,
                    g.active as i64,
                    g.created_at
                ],
            )?;
            Ok(self.conn.last_insert_rowid())
        }
    }

    pub fn delete_goal(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM goals WHERE id=?1", [id])?;
        Ok(())
    }

    // ---------- accomplishments ----------

    pub fn list_accomplishments(&self) -> Result<Vec<Accomplishment>> {
        let mut st = self.conn.prepare(
            "SELECT id, title, description, evidence_json, occurred_on, source, created_at
             FROM accomplishments ORDER BY occurred_on DESC",
        )?;
        let rows = st.query_map([], |r| {
            Ok(Accomplishment {
                id: Some(r.get(0)?),
                title: r.get(1)?,
                description: r.get(2)?,
                evidence_json: r.get(3)?,
                occurred_on: r.get(4)?,
                source: r.get(5)?,
                created_at: r.get(6)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn upsert_accomplishment(&self, a: &Accomplishment) -> Result<i64> {
        if let Some(id) = a.id {
            self.conn.execute(
                "UPDATE accomplishments SET title=?1, description=?2, evidence_json=?3,
                 occurred_on=?4, source=?5 WHERE id=?6",
                params![a.title, a.description, a.evidence_json, a.occurred_on, a.source, id],
            )?;
            Ok(id)
        } else {
            self.conn.execute(
                "INSERT INTO accomplishments(title, description, evidence_json, occurred_on, source, created_at)
                 VALUES(?1,?2,?3,?4,?5,?6)",
                params![a.title, a.description, a.evidence_json, a.occurred_on, a.source, a.created_at],
            )?;
            Ok(self.conn.last_insert_rowid())
        }
    }

    pub fn delete_accomplishment(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM accomplishments WHERE id=?1", [id])?;
        Ok(())
    }

    // ---------- retention / purge ----------

    pub fn purge_range(&self, since: i64, until: i64) -> Result<usize> {
        let raw = self.conn.execute(
            "DELETE FROM raw_activity_events WHERE started_at >= ?1 AND started_at < ?2",
            [since, until],
        )?;
        let sess = self.conn.execute(
            "DELETE FROM normalized_sessions WHERE started_at >= ?1 AND started_at < ?2",
            [since, until],
        )?;
        Ok(raw + sess)
    }

    // ---------- diagnostics helpers ----------

    pub fn count_raw_in_range(&self, since: i64, until: i64) -> Result<i64> {
        Ok(self.conn.query_row(
            "SELECT COUNT(*) FROM raw_activity_events
             WHERE started_at >= ?1 AND started_at < ?2",
            [since, until],
            |r| r.get(0),
        )?)
    }

    pub fn count_sessions_in_range(&self, since: i64, until: i64) -> Result<i64> {
        Ok(self.conn.query_row(
            "SELECT COUNT(*) FROM normalized_sessions
             WHERE started_at >= ?1 AND started_at < ?2",
            [since, until],
            |r| r.get(0),
        )?)
    }

    pub fn latest_raw(&self) -> Result<Option<RawEvent>> {
        let mut st = self.conn.prepare(
            "SELECT id, started_at, ended_at, app_name, window_title, browser_domain,
                    is_idle, is_private_window, normalized
             FROM raw_activity_events ORDER BY started_at DESC LIMIT 1",
        )?;
        let mut rows = st.query([])?;
        if let Some(r) = rows.next()? {
            Ok(Some(RawEvent {
                id: Some(r.get(0)?),
                started_at: r.get(1)?,
                ended_at: r.get(2)?,
                app_name: r.get(3)?,
                window_title: r.get(4)?,
                browser_domain: r.get(5)?,
                is_idle: r.get::<_, i64>(6)? != 0,
                is_private_window: r.get::<_, i64>(7)? != 0,
                normalized: r.get::<_, i64>(8)? != 0,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn latest_session(&self) -> Result<Option<NormalizedSession>> {
        let mut st = self.conn.prepare(
            "SELECT id, started_at, ended_at, duration_ms, app_name, title_root, browser_domain,
                    interruption_count, context_switch_count, source_event_ids_json, classified
             FROM normalized_sessions ORDER BY started_at DESC LIMIT 1",
        )?;
        let mut rows = st.query([])?;
        if let Some(r) = rows.next()? {
            Ok(Some(NormalizedSession {
                id: Some(r.get(0)?),
                started_at: r.get(1)?,
                ended_at: r.get(2)?,
                duration_ms: r.get(3)?,
                app_name: r.get(4)?,
                title_root: r.get(5)?,
                browser_domain: r.get(6)?,
                interruption_count: r.get(7)?,
                context_switch_count: r.get(8)?,
                source_event_ids_json: r.get(9)?,
                classified: r.get::<_, i64>(10)? != 0,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn delete_sessions_in_range(&self, since: i64, until: i64) -> Result<usize> {
        Ok(self.conn.execute(
            "DELETE FROM normalized_sessions WHERE started_at >= ?1 AND started_at < ?2",
            [since, until],
        )?)
    }
}
