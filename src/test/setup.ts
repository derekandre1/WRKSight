/**
 * Vitest setup. Keeps tests hermetic:
 *   - stub out the Tauri global so the IPC wrapper uses its mock backend
 *   - reset the mock store between tests
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { __resetMockStore } from "@/lib/tauri";

beforeEach(() => {
  // Ensure we never take the real-Tauri branch during tests.
  // @ts-expect-error — intentionally undefining
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  // @ts-expect-error — intentionally undefining
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  __resetMockStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});
