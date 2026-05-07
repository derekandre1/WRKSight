import { describe, it, expect, beforeEach } from "vitest";
import {
  testAnthropic,
  testGemini,
  testOllama,
  testOpenAi,
  testOpenAiCompatible,
  testOpenRouter,
} from "./connectionTests";
import { __setNetworkFetch } from "./http";

/**
 * These tests cover two things:
 *
 *   1. The "missing config" branch — fired before any network call. We
 *      check that each provider rejects empty config with `not_configured`.
 *   2. The HTTP-status -> TestResult mapping. We inject a fake fetch via
 *      `__setNetworkFetch` so the tests are hermetic.
 *
 * Because `isTauriRuntime()` returns false in jsdom, we also need to fake
 * the runtime check. The simplest way is to set the Tauri marker before
 * each test in this file.
 */

beforeEach(() => {
  // Pretend we're inside Tauri so `withNetwork` reaches the fetch path.
  // @ts-expect-error — assigning a sentinel value
  (globalThis as unknown as { window: typeof window }).window.__TAURI__ = {};
});

function fakeResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("connection tests — missing config branch", () => {
  beforeEach(() => __setNetworkFetch(null));

  it("anthropic without key → not_configured", async () => {
    const r = await testAnthropic({ apiKey: "", baseUrl: "", model: "" });
    expect(r.status).toBe("not_configured");
  });

  it("openai without key → not_configured", async () => {
    const r = await testOpenAi({ apiKey: "", baseUrl: "", model: "" });
    expect(r.status).toBe("not_configured");
  });

  it("gemini without key → not_configured", async () => {
    const r = await testGemini({ apiKey: "", baseUrl: "", model: "" });
    expect(r.status).toBe("not_configured");
  });

  it("openrouter without key → not_configured", async () => {
    const r = await testOpenRouter({ apiKey: "", baseUrl: "", model: "" });
    expect(r.status).toBe("not_configured");
  });

  it("ollama without baseUrl → not_configured", async () => {
    const r = await testOllama({ apiKey: "", baseUrl: "", model: "" });
    expect(r.status).toBe("not_configured");
  });

  it("openai_compatible without all three fields → not_configured", async () => {
    const r1 = await testOpenAiCompatible({ apiKey: "", baseUrl: "x", model: "y" });
    expect(r1.status).toBe("not_configured");
    const r2 = await testOpenAiCompatible({ apiKey: "k", baseUrl: "", model: "y" });
    expect(r2.status).toBe("not_configured");
    const r3 = await testOpenAiCompatible({ apiKey: "k", baseUrl: "x", model: "" });
    expect(r3.status).toBe("not_configured");
  });
});

describe("connection tests — HTTP status mapping", () => {
  it("200 → success (anthropic)", async () => {
    __setNetworkFetch(async () => fakeResponse(200));
    const r = await testAnthropic({ apiKey: "x", baseUrl: "", model: "" });
    expect(r.status).toBe("success");
  });

  it("401 → invalid_key (openai)", async () => {
    __setNetworkFetch(async () => fakeResponse(401));
    const r = await testOpenAi({ apiKey: "x", baseUrl: "", model: "" });
    expect(r.status).toBe("invalid_key");
  });

  it("403 → invalid_key (gemini)", async () => {
    __setNetworkFetch(async () => fakeResponse(403));
    const r = await testGemini({ apiKey: "x", baseUrl: "", model: "" });
    expect(r.status).toBe("invalid_key");
  });

  it("500 → request_failed (openrouter)", async () => {
    __setNetworkFetch(async () => fakeResponse(500));
    const r = await testOpenRouter({ apiKey: "x", baseUrl: "", model: "" });
    expect(r.status).toBe("request_failed");
  });

  it("network throw → request_failed (ollama)", async () => {
    __setNetworkFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const r = await testOllama({
      apiKey: "",
      baseUrl: "http://localhost:11434",
      model: "",
    });
    expect(r.status).toBe("request_failed");
    expect(r.message).toContain("ECONNREFUSED");
  });
});
