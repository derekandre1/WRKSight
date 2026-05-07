import { describe, it, expect } from "vitest";
import {
  PROVIDER_REGISTRY,
  getProviderDefinition,
  listProviders,
} from "./providers";
import { PROVIDER_IDS } from "./types";

describe("provider registry", () => {
  it("has an entry for every ProviderId", () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_REGISTRY[id]).toBeDefined();
      expect(PROVIDER_REGISTRY[id].id).toBe(id);
    }
  });

  it("listProviders returns all providers, real ones first", () => {
    const list = listProviders();
    expect(list).toHaveLength(PROVIDER_IDS.length);
    // mock and disabled should be at the end so the user picks a real
    // backend by default.
    const last = list.slice(-2).map((p) => p.id);
    expect(last.sort()).toEqual(["disabled", "mock"]);
  });

  it("each definition declares which fields it needs", () => {
    expect(PROVIDER_REGISTRY.anthropic.fields).toEqual({
      apiKey: true,
      baseUrl: false,
      model: true,
    });
    expect(PROVIDER_REGISTRY.ollama.fields).toEqual({
      apiKey: false,
      baseUrl: true,
      model: true,
    });
    expect(PROVIDER_REGISTRY.openai_compatible.fields).toEqual({
      apiKey: true,
      baseUrl: true,
      model: true,
    });
  });

  it("isReady gates Test correctly", () => {
    const a = PROVIDER_REGISTRY.anthropic;
    expect(a.isReady({ apiKey: "", baseUrl: "", model: "" })).toBe(false);
    expect(a.isReady({ apiKey: "sk-x", baseUrl: "", model: "" })).toBe(true);

    const ol = PROVIDER_REGISTRY.ollama;
    expect(ol.isReady({ apiKey: "", baseUrl: "", model: "" })).toBe(false);
    expect(ol.isReady({ apiKey: "", baseUrl: "http://x", model: "" })).toBe(false);
    expect(ol.isReady({ apiKey: "", baseUrl: "http://x", model: "llama3.1" })).toBe(true);

    const oc = PROVIDER_REGISTRY.openai_compatible;
    expect(oc.isReady({ apiKey: "k", baseUrl: "u", model: "" })).toBe(false);
    expect(oc.isReady({ apiKey: "k", baseUrl: "u", model: "m" })).toBe(true);
  });

  it("mock and disabled are always ready", () => {
    expect(
      PROVIDER_REGISTRY.mock.isReady({ apiKey: "", baseUrl: "", model: "" })
    ).toBe(true);
    expect(
      PROVIDER_REGISTRY.disabled.isReady({ apiKey: "", baseUrl: "", model: "" })
    ).toBe(true);
  });

  it("getProviderDefinition falls back to mock for unknown ids", () => {
    // @ts-expect-error — simulating bad data
    expect(getProviderDefinition("bogus").id).toBe("mock");
  });

  it("build returns an AiProvider with classifyBatch + summarize", () => {
    for (const id of PROVIDER_IDS) {
      const p = PROVIDER_REGISTRY[id].build({ apiKey: "", baseUrl: "", model: "" });
      expect(typeof p.classifyBatch).toBe("function");
      expect(typeof p.summarize).toBe("function");
      expect(typeof p.id).toBe("string");
    }
  });
});
