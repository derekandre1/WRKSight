import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

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

  it("passes through strings", () => {
    const s = parseSettings([["ai_provider", "anthropic"]]);
    expect(s.ai_provider).toBe("anthropic");
  });
});
