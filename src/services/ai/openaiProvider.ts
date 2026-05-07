/**
 * MOCK: OpenAI / OpenRouter / OpenAI-compatible inference STUB.
 *
 * Connection testing against the real endpoint works (see
 * `connectionTests.ts`). Inference falls back to the deterministic mock so
 * the activity pipeline keeps producing output without code changes.
 *
 * To wire up real inference, implement `classifyBatch` and `summarize` here
 * by POSTing to `${baseUrl}/chat/completions` with JSON-mode constraints
 * matching the zod schemas in `@/types`.
 */

import type { AiProvider, SummarizeArgs } from "./provider";
import type { NormalizedSession } from "@/types/activity";
import type { ClassificationFields } from "@/types/classification";
import type { ProviderConfig } from "./types";
import { MockAiProvider } from "./mockProvider";

export class OpenAiAiProvider implements AiProvider {
  readonly id = "openai-stub";
  private fallback = new MockAiProvider();

  constructor(private config: ProviderConfig) {}

  async classifyBatch(
    sessions: NormalizedSession[]
  ): Promise<ClassificationFields[]> {
    if (!this.config.apiKey) return this.fallback.classifyBatch(sessions);
    // TODO: POST baseUrl + /chat/completions with response_format=json_object
    //       and a system prompt that pins to ClassificationSchema.
    return this.fallback.classifyBatch(sessions);
  }

  async summarize(args: SummarizeArgs) {
    if (!this.config.apiKey) return this.fallback.summarize(args);
    // TODO: same transport, validate against StructuredSummarySchema.
    return this.fallback.summarize(args);
  }
}
