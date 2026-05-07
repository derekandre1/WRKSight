/**
 * Cross-runtime fetch shim.
 *
 * In a Tauri webview we route through `@tauri-apps/plugin-http` so we
 * bypass browser CORS — that's the only way to actually call provider
 * endpoints (Anthropic / OpenAI / Gemini all reject browser origins).
 *
 * Outside Tauri (plain `npm run dev`, Vitest) we hand back `null` so
 * callers can present a clear "test not available outside the desktop
 * runtime" message instead of silently failing.
 */

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

let cached: FetchFn | null | undefined; // undefined = unresolved, null = unavailable

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
}

export async function getNetworkFetch(): Promise<FetchFn | null> {
  if (cached !== undefined) return cached;
  if (!isTauriRuntime()) {
    cached = null;
    return cached;
  }
  try {
    const mod = await import("@tauri-apps/plugin-http");
    cached = mod.fetch as unknown as FetchFn;
  } catch {
    cached = null;
  }
  return cached;
}

/** Test-only: reset the cache so a unit test can swap implementations. */
export function __setNetworkFetch(fn: FetchFn | null): void {
  cached = fn;
}
