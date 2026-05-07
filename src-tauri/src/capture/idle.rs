//! Cross-platform idle-time detection.

use anyhow::Result;

pub trait IdleProvider: Send + Sync {
    fn idle_for_ms(&self) -> Result<u64>;
}

pub struct SystemIdleProvider;

impl IdleProvider for SystemIdleProvider {
    fn idle_for_ms(&self) -> Result<u64> {
        match user_idle::UserIdle::get_time() {
            // `as_milliseconds` returns u128; clamp into u64. Realistically
            // we'd never exceed u64::MAX ms (~584 million years), but be
            // defensive at the boundary so this can't ever panic.
            Ok(t) => Ok(u64::try_from(t.as_milliseconds()).unwrap_or(u64::MAX)),
            Err(_) => Ok(0),
        }
    }
}
