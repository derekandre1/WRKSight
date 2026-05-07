/**
 * MOCK: Anthropic inference STUB.
 *
 * Real connection-test against /v1/messages works (see `connectionTests.ts`).
 * Inference falls back to the deterministic mock so the pipeline keeps
 * producing output without code changes — wire up the two TODOs below to
 * make it real.
 */

import type { AiProvider, SummarizeArgs } from "./provider";
import type { NormalizedSession } from "@/types/activity";
import type { ClassificationFields } from "@/types/classification";
import type { ProviderConfig } from "./types";
import { MockAiProvider } from "./mockProvider";

export class AnthropicAiProvider implements AiProvider {
  readonly id = "anthropic-stub";
  private fallback = new MockAiProvider();

  constructor(private config: ProviderConfig) {}

  async classifyBatch(
    sessions: NormalizedSession[]
  ): Promise<ClassificationFields[]> {
    if (!this.config.apiKey) return this.fallback.classifyBatch(sessions);
    // TODO: POST api.anthropic.com/v1/messages with a cached system prompt
    //       carrying the category rules and tool/JSON-mode constraint
    //       matching ClassificationSchema. Validate every response.
    //
    // IMPORTANT: include header `anthropic-dangerous-direct-browser-access: true`.
    // Tauri webview requests ship an `Origin` header, so Anthropic treats
    // them as browser calls and returns HTTP 401 (permission_error) without
    // this opt-in — even when the key is valid. See connectionTests.ts.
    return this.fallback.classifyBatch(sessions);
  }

  async summarize(args: SummarizeArgs) {
    if (!this.config.apiKey) return this.fallback.summarize(args);
    // TODO: same transport, validate against StructuredSummarySchema.
    return this.fallback.summarize(args);
  }
}
