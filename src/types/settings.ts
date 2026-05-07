/**
 * Settings are stored as key/value strings on the Rust side. This module
 * gives the UI a typed view, including per-provider AI config.
 *
 * All AI config keys are namespaced `ai_<provider>_<field>` so the kv
 * store stays flat (no migrations needed) and individual fields can be
 * read/written atomically by the existing `set_setting` IPC.
 */

import type { ProviderConfig, ProviderId } from "@/services/ai/types";
import { isProviderId } from "@/services/ai/types";

export interface SettingsMap {
  // ---- capture ----------------------------------------------------
  tracking_paused: boolean;
  private_mode: boolean;
  capture_interval_ms: number;
  idle_threshold_ms: number;
  retention_days: number;

  // ---- AI: which provider is active -------------------------------
  ai_active_provider: ProviderId;

  // ---- AI: per-provider credentials -------------------------------
  ai_anthropic_api_key: string;
  ai_anthropic_model: string;

  ai_openai_api_key: string;
  ai_openai_base_url: string;
  ai_openai_model: string;

  ai_gemini_api_key: string;
  ai_gemini_model: string;

  ai_openrouter_api_key: string;
  ai_openrouter_model: string;

  ai_ollama_base_url: string;
  ai_ollama_model: string;

  ai_openai_compat_api_key: string;
  ai_openai_compat_base_url: string;
  ai_openai_compat_model: string;

  // ---- internal ---------------------------------------------------
  last_normalized_at: number;
}

export const DEFAULT_SETTINGS: SettingsMap = {
  tracking_paused: true, // opt-in by default
  private_mode: false,
  capture_interval_ms: 5_000,
  idle_threshold_ms: 180_000,
  retention_days: 180,

  ai_active_provider: "mock",

  ai_anthropic_api_key: "",
  ai_anthropic_model: "",

  ai_openai_api_key: "",
  ai_openai_base_url: "",
  ai_openai_model: "",

  ai_gemini_api_key: "",
  ai_gemini_model: "",

  ai_openrouter_api_key: "",
  ai_openrouter_model: "",

  ai_ollama_base_url: "",
  ai_ollama_model: "",

  ai_openai_compat_api_key: "",
  ai_openai_compat_base_url: "",
  ai_openai_compat_model: "",

  last_normalized_at: 0,
};

export function parseSettings(pairs: [string, string][]): SettingsMap {
  const map = Object.fromEntries(pairs) as Record<string, string>;
  const out = { ...DEFAULT_SETTINGS };

  // booleans
  for (const k of ["tracking_paused", "private_mode"] as const) {
    if (map[k] !== undefined) out[k] = map[k] === "true";
  }
  // numbers
  for (const k of [
    "capture_interval_ms",
    "idle_threshold_ms",
    "retention_days",
    "last_normalized_at",
  ] as const) {
    if (map[k] !== undefined) {
      const n = Number(map[k]);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  // active provider — validate it's one of the known ids
  if (map.ai_active_provider !== undefined) {
    if (isProviderId(map.ai_active_provider)) {
      out.ai_active_provider = map.ai_active_provider;
    }
  }
  // remaining strings
  const stringKeys: Array<keyof SettingsMap> = [
    "ai_anthropic_api_key",
    "ai_anthropic_model",
    "ai_openai_api_key",
    "ai_openai_base_url",
    "ai_openai_model",
    "ai_gemini_api_key",
    "ai_gemini_model",
    "ai_openrouter_api_key",
    "ai_openrouter_model",
    "ai_ollama_base_url",
    "ai_ollama_model",
    "ai_openai_compat_api_key",
    "ai_openai_compat_base_url",
    "ai_openai_compat_model",
  ];
  for (const k of stringKeys) {
    if (map[k as string] !== undefined) {
      (out as unknown as Record<string, string>)[k as string] = map[k as string];
    }
  }
  return out;
}

// ---- per-provider config helpers ------------------------------------

interface ProviderKeyMap {
  apiKey?: keyof SettingsMap;
  baseUrl?: keyof SettingsMap;
  model?: keyof SettingsMap;
}

const PROVIDER_KEYS: Record<ProviderId, ProviderKeyMap> = {
  mock: {},
  disabled: {},
  anthropic: {
    apiKey: "ai_anthropic_api_key",
    model: "ai_anthropic_model",
  },
  openai: {
    apiKey: "ai_openai_api_key",
    baseUrl: "ai_openai_base_url",
    model: "ai_openai_model",
  },
  gemini: {
    apiKey: "ai_gemini_api_key",
    model: "ai_gemini_model",
  },
  openrouter: {
    apiKey: "ai_openrouter_api_key",
    model: "ai_openrouter_model",
  },
  ollama: {
    baseUrl: "ai_ollama_base_url",
    model: "ai_ollama_model",
  },
  openai_compatible: {
    apiKey: "ai_openai_compat_api_key",
    baseUrl: "ai_openai_compat_base_url",
    model: "ai_openai_compat_model",
  },
};

export function getProviderConfig(
  settings: SettingsMap,
  id: ProviderId
): ProviderConfig {
  const map = PROVIDER_KEYS[id];
  return {
    apiKey: map.apiKey ? (settings[map.apiKey] as string) : "",
    baseUrl: map.baseUrl ? (settings[map.baseUrl] as string) : "",
    model: map.model ? (settings[map.model] as string) : "",
  };
}

/** Returns a list of (settings_key, value) pairs for a provider's config. */
export function providerConfigUpdates(
  id: ProviderId,
  config: ProviderConfig
): Array<[keyof SettingsMap, string]> {
  const map = PROVIDER_KEYS[id];
  const out: Array<[keyof SettingsMap, string]> = [];
  if (map.apiKey) out.push([map.apiKey, config.apiKey ?? ""]);
  if (map.baseUrl) out.push([map.baseUrl, config.baseUrl ?? ""]);
  if (map.model) out.push([map.model, config.model ?? ""]);
  return out;
}
