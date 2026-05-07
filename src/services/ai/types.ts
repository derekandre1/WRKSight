/**
 * Shared types for the AI provider layer.
 *
 * The two concerns intentionally live next to each other but stay separate:
 *   - inference (classify / summarize) → see `AiProvider` in `provider.ts`
 *   - connectivity & credentials  → ProviderConfig + TestResult here
 *
 * The Settings page only needs the second; the activity pipeline only needs
 * the first; both are wired together via the registry in `providers.ts`.
 */

export const PROVIDER_IDS = [
  "mock",
  "disabled",
  "anthropic",
  "openai",
  "gemini",
  "openrouter",
  "ollama",
  "openai_compatible",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const EMPTY_CONFIG: ProviderConfig = {
  apiKey: "",
  baseUrl: "",
  model: "",
};

/**
 * Which fields the UI should render for a given provider. The page also uses
 * this to decide when to enable the Test Connection button.
 */
export interface ProviderFieldFlags {
  apiKey: boolean;
  baseUrl: boolean;
  model: boolean;
}

export type ConnectionStatus =
  | "idle"               // page just loaded, nothing to report
  | "not_configured"     // required fields missing
  | "dirty"              // user has typed but not saved
  | "saving"             // persistence in flight
  | "saved"              // saved locally, never tested
  | "testing"            // test in flight
  | "success"            // last test succeeded
  | "invalid_key"        // last test got 401-like
  | "request_failed";    // network / 5xx / unknown error

export interface TestResult {
  status: Extract<
    ConnectionStatus,
    "success" | "invalid_key" | "request_failed" | "not_configured"
  >;
  message: string;
}
