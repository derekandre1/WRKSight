/**
 * MOCK: Anthropic provider STUB. Intentionally not wired to fetch() yet so
 * this scaffold does not silently make network calls.
 *
 * To activate:
 *   1. Set `ai_provider=anthropic` and `ai_api_key=...` in Settings.
 *   2. Implement the two TODOs below to call the Messages API with a
 *      prompt-caching block for the category rules and a JSON-mode response
 *      validated against the zod schemas in `@/types`.
 *   3. Respect the MockAiProvider's output shape so pipelines don't change.
 */

import type { AiProvider, SummarizeArgs } from "./provider";
import type { NormalizedSession } from "@/types/activity";
import type { ClassificationFields } from "@/types/classification";
import { MockAiProvider } from "./mockProvider";

export class AnthropicAiProvider implements AiProvider {
  readonly id = "anthropic-stub";
  private fallback = new MockAiProvider();
  constructor(private apiKey: string) {}

  async classifyBatch(
    sessions: NormalizedSession[]
  ): Promise<ClassificationFields[]> {
    if (!this.apiKey) return this.fallback.classifyBatch(sessions);
    // TODO: Call Anthropic Messages API with JSON mode + cached system prompt.
    //       Validate each returned object with `ClassificationSchema`.
    //       On parse failure, fall back to mock for that session.
    return this.fallback.classifyBatch(sessions);
  }

  async summarize(args: SummarizeArgs) {
    if (!this.apiKey) return this.fallback.summarize(args);
    // TODO: Call Messages API with the structured-summary zod schema passed
    //       as a tool/JSON-mode constraint.
    return this.fallback.summarize(args);
  }
}
