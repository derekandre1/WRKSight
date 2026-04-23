//! Privacy filter. Applied to every sample **before** it reaches the DB.
//!
//! Rules are loaded once per tick from the `exclusions` table. This is the
//! only place that decides "should this sample be persisted at all?"

use crate::db::repo::{Exclusion, RawEvent, Repo};
use anyhow::Result;
use rusqlite::Connection;

#[derive(Debug, Clone)]
pub struct PrivacyFilter {
    app_names: Vec<String>,
    domains: Vec<String>,
    title_globs: Vec<String>,
}

impl PrivacyFilter {
    pub fn load(conn: &Connection) -> Result<Self> {
        let repo = Repo::new(conn);
        let exs = repo.list_exclusions()?;
        let mut app_names = vec![];
        let mut domains = vec![];
        let mut title_globs = vec![];
        for e in exs {
            match e.kind.as_str() {
                "app" => app_names.push(e.value.to_lowercase()),
                "domain" => domains.push(e.value.to_lowercase()),
                "title_glob" => title_globs.push(e.value.to_lowercase()),
                _ => {}
            }
        }
        Ok(Self { app_names, domains, title_globs })
    }

    /// Returns `true` if the sample should be suppressed (not persisted).
    pub fn should_exclude(&self, sample: &RawEvent) -> bool {
        let app = sample.app_name.to_lowercase();
        if self.app_names.iter().any(|a| app == *a || app.contains(a)) {
            return true;
        }
        if let Some(d) = &sample.browser_domain {
            let d = d.to_lowercase();
            if self.domains.iter().any(|dom| d == *dom || d.ends_with(&format!(".{dom}"))) {
                return true;
            }
        }
        if !self.title_globs.is_empty() {
            let title = sample.window_title.to_lowercase();
            if self.title_globs.iter().any(|g| title.contains(g)) {
                return true;
            }
        }
        false
    }

    /// In private mode, we still want duration accounting but not titles.
    pub fn redact_for_private_mode(mut sample: RawEvent) -> RawEvent {
        sample.window_title = String::new();
        sample.is_private_window = true;
        sample
    }
}

pub fn seed_default_exclusions(conn: &Connection) -> Result<()> {
    let repo = Repo::new(conn);
    for (kind, value) in DEFAULT_EXCLUSIONS {
        let _ = repo.add_exclusion(&Exclusion {
            id: None,
            kind: kind.to_string(),
            value: value.to_string(),
            note: Some("default".into()),
        });
    }
    Ok(())
}

/// These are suppressed by default — things that should never be tracked
/// unless the user explicitly removes them.
const DEFAULT_EXCLUSIONS: &[(&str, &str)] = &[
    ("app", "1Password"),
    ("app", "Bitwarden"),
    ("app", "KeePassXC"),
    ("domain", "my.bank.com"),
    ("title_glob", "password"),
    ("title_glob", "incognito"),
    ("title_glob", "private browsing"),
];

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn seeded_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::apply(&mut conn).unwrap();
        let repo = Repo::new(&conn);
        repo.add_exclusion(&Exclusion {
            id: None,
            kind: "app".into(),
            value: "1Password".into(),
            note: None,
        })
        .unwrap();
        repo.add_exclusion(&Exclusion {
            id: None,
            kind: "domain".into(),
            value: "reddit.com".into(),
            note: None,
        })
        .unwrap();
        repo.add_exclusion(&Exclusion {
            id: None,
            kind: "title_glob".into(),
            value: "incognito".into(),
            note: None,
        })
        .unwrap();
        conn
    }

    fn sample(app: &str, title: &str, domain: Option<&str>) -> RawEvent {
        RawEvent {
            id: None,
            started_at: 0,
            ended_at: None,
            app_name: app.into(),
            window_title: title.into(),
            browser_domain: domain.map(str::to_string),
            is_idle: false,
            is_private_window: false,
            normalized: false,
        }
    }

    #[test]
    fn excludes_password_manager() {
        let conn = seeded_conn();
        let pf = PrivacyFilter::load(&conn).unwrap();
        assert!(pf.should_exclude(&sample("1Password", "Vault", None)));
    }

    #[test]
    fn excludes_reddit_subdomain() {
        let conn = seeded_conn();
        let pf = PrivacyFilter::load(&conn).unwrap();
        assert!(pf.should_exclude(&sample("Chrome", "Reddit", Some("old.reddit.com"))));
        assert!(pf.should_exclude(&sample("Chrome", "Reddit", Some("reddit.com"))));
        assert!(!pf.should_exclude(&sample("Chrome", "GitHub", Some("github.com"))));
    }

    #[test]
    fn excludes_incognito_titles() {
        let conn = seeded_conn();
        let pf = PrivacyFilter::load(&conn).unwrap();
        assert!(pf.should_exclude(&sample("Chrome", "New Incognito Tab", None)));
    }

    #[test]
    fn does_not_exclude_ordinary_work() {
        let conn = seeded_conn();
        let pf = PrivacyFilter::load(&conn).unwrap();
        assert!(!pf.should_exclude(&sample("VSCode", "wrksight-lib", None)));
    }
}
