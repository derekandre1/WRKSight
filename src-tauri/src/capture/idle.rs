//! Cross-platform idle-time detection.

use anyhow::Result;

pub trait IdleProvider: Send + Sync {
    fn idle_for_ms(&self) -> Result<u64>;
}

pub struct SystemIdleProvider;

impl IdleProvider for SystemIdleProvider {
    fn idle_for_ms(&self) -> Result<u64> {
        match user_idle::UserIdle::get_time() {
            Ok(t) => Ok(t.as_milliseconds()),
            Err(_) => Ok(0),
        }
    }
}
