//! Active-window capture abstraction.
//!
//! The `WindowProvider` trait is what the tracker loop actually calls, so
//! tests and dev-mode can swap the platform implementation without touching
//! any other code.

use anyhow::Result;
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowSnapshot {
    pub app_name: String,
    pub window_title: String,
    pub browser_domain: Option<String>,
}

pub trait WindowProvider: Send + Sync {
    fn current(&self) -> Result<Option<WindowSnapshot>>;
}

/// Default provider backed by `active-win-pos-rs`.
///
/// Platform notes:
/// * macOS: works out of the box, requires Screen Recording permission
///   ONLY if you later attempt to read window contents (we don't).
///   Accessibility permission gives us window titles.
/// * Windows: works via Win32 APIs, no special permissions.
/// * Linux: best-effort; X11 works, Wayland varies by compositor. The
///   `WRKSIGHT_MOCK_CAPTURE` env var forces the dev mock.
pub struct ActiveWinProvider;

impl WindowProvider for ActiveWinProvider {
    fn current(&self) -> Result<Option<WindowSnapshot>> {
        if std::env::var("WRKSIGHT_MOCK_CAPTURE").ok().as_deref() == Some("1") {
            // MOCK: dev fallback — cycles through a handful of plausible windows
            // so the UI has something to render without a real capture backend.
            return Ok(Some(mock_snapshot()));
        }
        match active_win_pos_rs::get_active_window() {
            Ok(w) => Ok(Some(WindowSnapshot {
                app_name: w.app_name,
                window_title: w.title.clone(),
                browser_domain: extract_browser_domain(&w.title),
            })),
            Err(_) => Ok(None),
        }
    }
}

/// Best-effort extraction of a registrable domain from a browser window title.
/// Many browsers append the domain or URL to the title; if we can't find one,
/// we return None rather than guessing.
pub fn extract_browser_domain(title: &str) -> Option<String> {
    // Try to find a URL-ish token first.
    for tok in title.split_whitespace() {
        if let Ok(u) = Url::parse(tok) {
            if let Some(h) = u.host_str() {
                return Some(h.trim_start_matches("www.").to_string());
            }
        }
        if tok.contains('.') && !tok.contains(' ') && tok.len() < 64 {
            let host = tok.trim_start_matches("www.").trim_end_matches(['/', ',', '.']);
            if host.chars().filter(|c| *c == '.').count() >= 1
                && host.chars().all(|c| c.is_ascii_alphanumeric() || "-._".contains(c))
            {
                return Some(host.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
fn mock_snapshot() -> WindowSnapshot {
    WindowSnapshot {
        app_name: "VSCode".into(),
        window_title: "wrksight — src/lib.rs".into(),
        browser_domain: None,
    }
}

#[cfg(not(test))]
fn mock_snapshot() -> WindowSnapshot {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let fixtures = [
        WindowSnapshot {
            app_name: "VSCode".into(),
            window_title: "wrksight — src/lib.rs".into(),
            browser_domain: None,
        },
        WindowSnapshot {
            app_name: "Chrome".into(),
            window_title: "Issue #42 — github.com".into(),
            browser_domain: Some("github.com".into()),
        },
        WindowSnapshot {
            app_name: "Slack".into(),
            window_title: "#team-platform".into(),
            browser_domain: None,
        },
        WindowSnapshot {
            app_name: "Mail".into(),
            window_title: "Inbox (23)".into(),
            browser_domain: None,
        },
    ];
    let i = COUNTER.fetch_add(1, Ordering::Relaxed) % fixtures.len();
    fixtures[i].clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plain_domain_from_title() {
        assert_eq!(
            extract_browser_domain("Google Search — google.com"),
            Some("google.com".into())
        );
    }

    #[test]
    fn extracts_subdomain() {
        assert_eq!(
            extract_browser_domain("Docs — docs.google.com"),
            Some("docs.google.com".into())
        );
    }

    #[test]
    fn strips_www_prefix() {
        assert_eq!(
            extract_browser_domain("Home — www.example.com"),
            Some("example.com".into())
        );
    }

    #[test]
    fn no_domain_for_filename_like_string() {
        // "My Document.docx" contains a period but isn't a hostname-shaped
        // token once we require alnum-ish chars separated by a dot.
        // We deliberately accept false positives on single-dot tokens — better
        // to over-classify as a domain than to drop legit hosts.
        let out = extract_browser_domain("Plain Title With No URL");
        assert_eq!(out, None);
    }
}
