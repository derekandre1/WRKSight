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

describe("anthropic — error-envelope routing (regression)", () => {
  it("sends the dangerous-direct-browser-access header", async () => {
    let captured: Headers | null = null;
    __setNetworkFetch(async (_url, init) => {
      captured = new Headers(init?.headers);
      return fakeResponse(200);
    });
    await testAnthropic({ apiKey: "  sk-ant-test  ", baseUrl: "", model: "" });
    expect(captured).not.toBeNull();
    expect(captured!.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect(captured!.get("anthropic-version")).toBe("2023-06-01");
    // Trims whitespace before sending.
    expect(captured!.get("x-api-key")).toBe("sk-ant-test");
  });

  it("401 with permission_error body → request_failed (NOT invalid_key)", async () => {
    __setNetworkFetch(async () =>
      fakeResponse(401, {
        type: "error",
        error: {
          type: "permission_error",
          message:
            "Direct browser access is not allowed. Add the anthropic-dangerous-direct-browser-access header.",
        },
      })
    );
    const r = await testAnthropic({ apiKey: "valid-key", baseUrl: "", model: "" });
    expect(r.status).toBe("request_failed");
    expect(r.message).toMatch(/Direct browser access/);
    expect(r.message).not.toMatch(/^API key was rejected/);
  });

  it("401 with authentication_error body → invalid_key with the real message", async () => {
    __setNetworkFetch(async () =>
      fakeResponse(401, {
        type: "error",
        error: { type: "authentication_error", message: "invalid x-api-key" },
      })
    );
    const r = await testAnthropic({ apiKey: "bad", baseUrl: "", model: "" });
    expect(r.status).toBe("invalid_key");
    expect(r.message).toBe("invalid x-api-key");
  });

  it("400 invalid_request_error → request_failed with detail", async () => {
    __setNetworkFetch(async () =>
      fakeResponse(400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "messages: array required",
        },
      })
    );
    const r = await testAnthropic({ apiKey: "k", baseUrl: "", model: "" });
    expect(r.status).toBe("request_failed");
    expect(r.message).toMatch(/messages: array required/);
  });

  it("404 not_found_error → request_failed (model id problem, not key)", async () => {
    __setNetworkFetch(async () =>
      fakeResponse(404, {
        type: "error",
        error: { type: "not_found_error", message: "model not found: claude-9000" },
      })
    );
    const r = await testAnthropic({
      apiKey: "k",
      baseUrl: "",
      model: "claude-9000",
    });
    expect(r.status).toBe("request_failed");
    expect(r.message).toMatch(/model not found/);
  });

  it("401 with no JSON body still reports the status detail (last-resort fallback)", async () => {
    // Simulate an upstream proxy returning text/plain.
    __setNetworkFetch(
      async () =>
        new Response("Forbidden by intermediary", {
          status: 401,
          statusText: "Unauthorized",
          headers: { "content-type": "text/plain" },
        })
    );
    const r = await testAnthropic({ apiKey: "k", baseUrl: "", model: "" });
    expect(r.status).toBe("invalid_key");
    expect(r.message).toMatch(/401|Unauthorized/);
  });
});
