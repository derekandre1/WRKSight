/**
 * Per-provider connection tests.
 *
 * Each test makes ONE small request — never an inference call — and maps
 * the response to a `TestResult`. Specifically:
 *
 *   - 200/2xx        → success
 *   - 401 / 403      → invalid_key
 *   - other          → request_failed
 *
 * Outside the Tauri runtime there's no usable cross-origin fetch, so we
 * report a clear "test only available in the desktop app" instead of
 * silently masking the limitation.
 */

import { getNetworkFetch, isTauriRuntime } from "./http";
import type { ProviderConfig, TestResult } from "./types";

const NOT_AVAILABLE: TestResult = {
  status: "request_failed",
  message:
    "Connection testing is only available inside the WRKSight desktop app (browser dev mode can't bypass CORS).",
};

async function withNetwork<T>(
  fn: (fetchFn: (url: string, init?: RequestInit) => Promise<Response>) => Promise<T>
): Promise<T | TestResult> {
  if (!isTauriRuntime()) return NOT_AVAILABLE;
  const fetchFn = await getNetworkFetch();
  if (!fetchFn) return NOT_AVAILABLE;
  try {
    return await fn(fetchFn);
  } catch (e) {
    return reqFailed(e);
  }
}

function ok(message: string): TestResult {
  return { status: "success", message };
}
function badKey(message = "API key was rejected (HTTP 401)."): TestResult {
  return { status: "invalid_key", message };
}
function reqFailed(e: unknown): TestResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { status: "request_failed", message: msg || "Request failed." };
}
function classify(res: Response, onSuccess: string): TestResult {
  if (res.ok) return ok(onSuccess);
  if (res.status === 401 || res.status === 403)
    return badKey(`API key was rejected (HTTP ${res.status}).`);
  return { status: "request_failed", message: `HTTP ${res.status} ${res.statusText}` };
}

// ---------- Anthropic ----------------------------------------------

/**
 * Anthropic test.
 *
 * Why the request shape matters:
 *   - The WRKSight webview sends an `Origin` header (`tauri://localhost`).
 *     Anthropic treats *any* request with a browser-style Origin as
 *     untrusted unless we opt in with
 *     `anthropic-dangerous-direct-browser-access: true`. Without that
 *     header Anthropic returns **HTTP 401** with a `permission_error`
 *     body — even when the key is valid. We were mapping that 401 to
 *     "invalid key" which was the wrong diagnosis.
 *   - The flag is the right call here: WRKSight is a desktop app, the
 *     key only ever lives in the user's own local SQLite, and there is
 *     no third-party page that could exfiltrate it.
 *
 * We also trim the key in case the user pasted with whitespace.
 */
export async function testAnthropic(c: ProviderConfig): Promise<TestResult> {
  const apiKey = c.apiKey.trim();
  if (!apiKey)
    return { status: "not_configured", message: "Missing API key." };
  const model = (c.model || "claude-haiku-4-5").trim();

  const out = await withNetwork(async (fetch) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    return await classifyAnthropicResponse(res);
  });
  return out as TestResult;
}

/**
 * Anthropic returns a structured error envelope:
 *   { type: "error", error: { type: "...", message: "..." } }
 *
 * `error.type` tells us exactly what's wrong; the HTTP status alone is
 * ambiguous (401 can mean bad key OR missing browser-access header). We
 * use the type to route to the right ConnectionStatus and surface
 * Anthropic's verbatim message so the user sees the real cause.
 */
async function classifyAnthropicResponse(res: Response): Promise<TestResult> {
  if (res.ok) return { status: "success", message: "Connected to Anthropic." };

  let body: { error?: { type?: string; message?: string } } | null = null;
  try {
    body = await res.json();
  } catch {
    // Anthropic always JSON-encodes errors; if parsing fails we likely
    // hit a proxy or a network appliance. Fall through.
  }
  const errType = body?.error?.type;
  const errMsg = body?.error?.message?.trim();
  const detail = errMsg ?? `${res.status} ${res.statusText}`.trim();

  switch (errType) {
    case "authentication_error":
      return { status: "invalid_key", message: errMsg ?? "API key was rejected." };
    case "permission_error":
      return {
        status: "request_failed",
        message: errMsg
          ? `Permission denied: ${errMsg}`
          : "Permission denied. The request reached Anthropic but was refused — check that the key has access to this model.",
      };
    case "invalid_request_error":
      return {
        status: "request_failed",
        message: errMsg
          ? `Invalid request: ${errMsg}`
          : `Invalid request (HTTP ${res.status}).`,
      };
    case "not_found_error":
      return {
        status: "request_failed",
        message: errMsg ?? "Endpoint or model not found. Check the model id.",
      };
    case "rate_limit_error":
      return {
        status: "request_failed",
        message: errMsg ?? "Rate limited — slow down and retry.",
      };
    case "api_error":
    case "overloaded_error":
      return { status: "request_failed", message: errMsg ?? "Anthropic API error." };
  }

  // No structured envelope (proxy, network appliance, etc.). Fall back to
  // status-based mapping but ALWAYS preserve any text we got, so the user
  // never sees a bare "API key rejected" when the real issue was upstream.
  if (res.status === 401 || res.status === 403)
    return { status: "invalid_key", message: detail };
  return { status: "request_failed", message: detail };
}

// ---------- OpenAI / OpenRouter / OpenAI-compatible ----------------

export async function testOpenAi(c: ProviderConfig): Promise<TestResult> {
  if (!c.apiKey) return { status: "not_configured", message: "Missing API key." };
  const base = c.baseUrl || "https://api.openai.com/v1";
  const out = await withNetwork(async (fetch) => {
    const res = await fetch(`${base.replace(/\/+$/, "")}/models`, {
      headers: { authorization: `Bearer ${c.apiKey}` },
    });
    if (res.ok) {
      try {
        const j = (await res.json()) as { data?: unknown[] };
        const n = Array.isArray(j.data) ? j.data.length : null;
        return ok(n != null ? `Connected — ${n} models available.` : "Connected to OpenAI.");
      } catch {
        return ok("Connected to OpenAI.");
      }
    }
    return classify(res, "Connected to OpenAI.");
  });
  return out as TestResult;
}

export async function testOpenRouter(c: ProviderConfig): Promise<TestResult> {
  if (!c.apiKey) return { status: "not_configured", message: "Missing API key." };
  const base = c.baseUrl || "https://openrouter.ai/api/v1";
  const out = await withNetwork(async (fetch) => {
    const res = await fetch(`${base.replace(/\/+$/, "")}/models`, {
      headers: { authorization: `Bearer ${c.apiKey}` },
    });
    return classify(res, "Connected to OpenRouter.");
  });
  return out as TestResult;
}

export async function testOpenAiCompatible(
  c: ProviderConfig
): Promise<TestResult> {
  if (!c.apiKey) return { status: "not_configured", message: "Missing API key." };
  if (!c.baseUrl) return { status: "not_configured", message: "Missing base URL." };
  if (!c.model) return { status: "not_configured", message: "Missing model name." };
  const out = await withNetwork(async (fetch) => {
    const res = await fetch(
      `${c.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${c.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: c.model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      }
    );
    return classify(res, "Connected to custom endpoint.");
  });
  return out as TestResult;
}

// ---------- Gemini -------------------------------------------------

export async function testGemini(c: ProviderConfig): Promise<TestResult> {
  if (!c.apiKey) return { status: "not_configured", message: "Missing API key." };
  const out = await withNetwork(async (fetch) => {
    // Gemini auths via ?key= query param. List models — lightweight call.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        c.apiKey
      )}`
    );
    return classify(res, "Connected to Gemini.");
  });
  return out as TestResult;
}

// ---------- Ollama -------------------------------------------------

export async function testOllama(c: ProviderConfig): Promise<TestResult> {
  if (!c.baseUrl)
    return { status: "not_configured", message: "Missing base URL." };
  const base = c.baseUrl.replace(/\/+$/, "");
  const out = await withNetwork(async (fetch) => {
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) {
      return {
        status: "request_failed",
        message: `Ollama at ${base} replied ${res.status}.`,
      } as TestResult;
    }
    if (!c.model) return ok("Ollama is reachable. Pick a model to enable inference.");
    try {
      const j = (await res.json()) as { models?: Array<{ name?: string }> };
      const has = (j.models ?? []).some((m) => m.name?.startsWith(c.model));
      return ok(
        has
          ? `Ollama is reachable; model "${c.model}" is installed.`
          : `Ollama is reachable, but model "${c.model}" isn't installed yet — try "ollama pull ${c.model}".`
      );
    } catch {
      return ok("Ollama is reachable.");
    }
  });
  return out as TestResult;
}
