import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  parseSettings,
  getProviderConfig,
  providerConfigUpdates,
} from "./settings";

describe("parseSettings", () => {
  it("returns defaults when given nothing", () => {
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it("coerces booleans from strings", () => {
    const s = parseSettings([
      ["tracking_paused", "false"],
      ["private_mode", "true"],
    ]);
    expect(s.tracking_paused).toBe(false);
    expect(s.private_mode).toBe(true);
  });

  it("coerces numbers and falls back on junk", () => {
    const s = parseSettings([
      ["capture_interval_ms", "2500"],
      ["retention_days", "not-a-number"],
    ]);
    expect(s.capture_interval_ms).toBe(2500);
    expect(s.retention_days).toBe(DEFAULT_SETTINGS.retention_days);
  });

  it("validates ai_active_provider against the registry", () => {
    expect(parseSettings([["ai_active_provider", "anthropic"]]).ai_active_provider).toBe(
      "anthropic"
    );
    // Bogus values fall back to the default (mock), never trusted.
    expect(parseSettings([["ai_active_provider", "evil"]]).ai_active_provider).toBe(
      DEFAULT_SETTINGS.ai_active_provider
    );
  });

  it("passes through per-provider strings", () => {
    const s = parseSettings([
      ["ai_anthropic_api_key", "sk-ant-test"],
      ["ai_openai_base_url", "https://example.com/v1"],
      ["ai_ollama_model", "llama3.1"],
    ]);
    expect(s.ai_anthropic_api_key).toBe("sk-ant-test");
    expect(s.ai_openai_base_url).toBe("https://example.com/v1");
    expect(s.ai_ollama_model).toBe("llama3.1");
  });
});

describe("getProviderConfig", () => {
  it("reads anthropic config from namespaced keys", () => {
    const s = parseSettings([
      ["ai_active_provider", "anthropic"],
      ["ai_anthropic_api_key", "sk-test"],
      ["ai_anthropic_model", "claude-haiku-4-5"],
    ]);
    expect(getProviderConfig(s, "anthropic")).toEqual({
      apiKey: "sk-test",
      baseUrl: "",
      model: "claude-haiku-4-5",
    });
  });

  it("reads openai_compatible's three fields", () => {
    const s = parseSettings([
      ["ai_openai_compat_api_key", "k"],
      ["ai_openai_compat_base_url", "https://gw.example/v1"],
      ["ai_openai_compat_model", "x"],
    ]);
    expect(getProviderConfig(s, "openai_compatible")).toEqual({
      apiKey: "k",
      baseUrl: "https://gw.example/v1",
      model: "x",
    });
  });

  it("returns empty for utility providers (mock/disabled)", () => {
    const s = DEFAULT_SETTINGS;
    expect(getProviderConfig(s, "mock")).toEqual({ apiKey: "", baseUrl: "", model: "" });
    expect(getProviderConfig(s, "disabled")).toEqual({ apiKey: "", baseUrl: "", model: "" });
  });
});

describe("providerConfigUpdates", () => {
  it("emits exactly the keys the provider needs", () => {
    const updates = providerConfigUpdates("ollama", {
      apiKey: "ignored",
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
    });
    expect(updates.map(([k]) => k).sort()).toEqual(
      ["ai_ollama_base_url", "ai_ollama_model"].sort()
    );
  });

  it("emits all three for openai_compatible", () => {
    const updates = providerConfigUpdates("openai_compatible", {
      apiKey: "k",
      baseUrl: "https://x",
      model: "m",
    });
    expect(updates).toHaveLength(3);
  });

  it("emits nothing for mock/disabled", () => {
    expect(
      providerConfigUpdates("mock", { apiKey: "", baseUrl: "", model: "" })
    ).toEqual([]);
  });
});
