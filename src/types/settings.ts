/**
 * Settings are stored as key/value strings on the Rust side.
 * This module gives the UI a typed view.
 */

export interface SettingsMap {
  tracking_paused: boolean;
  private_mode: boolean;
  capture_interval_ms: number;
  idle_threshold_ms: number;
  retention_days: number;
  ai_provider: "mock" | "anthropic" | "disabled";
  ai_api_key: string;              // stored in plaintext today; TODO: OS keyring
  last_normalized_at: number;
}

export const DEFAULT_SETTINGS: SettingsMap = {
  tracking_paused: true,            // opt-in by default
  private_mode: false,
  capture_interval_ms: 5_000,
  idle_threshold_ms: 180_000,
  retention_days: 180,
  ai_provider: "mock",
  ai_api_key: "",
  last_normalized_at: 0,
};

export function parseSettings(pairs: [string, string][]): SettingsMap {
  const map = Object.fromEntries(pairs) as Record<string, string>;
  const coerce = <K extends keyof SettingsMap>(k: K): SettingsMap[K] => {
    const raw = map[k];
    const def = DEFAULT_SETTINGS[k];
    if (raw === undefined) return def;
    if (typeof def === "boolean") return (raw === "true") as SettingsMap[K];
    if (typeof def === "number") {
      const n = Number(raw);
      return (Number.isFinite(n) ? n : def) as SettingsMap[K];
    }
    return raw as SettingsMap[K];
  };
  return {
    tracking_paused: coerce("tracking_paused"),
    private_mode: coerce("private_mode"),
    capture_interval_ms: coerce("capture_interval_ms"),
    idle_threshold_ms: coerce("idle_threshold_ms"),
    retention_days: coerce("retention_days"),
    ai_provider: coerce("ai_provider"),
    ai_api_key: coerce("ai_api_key"),
    last_normalized_at: coerce("last_normalized_at"),
  };
}
