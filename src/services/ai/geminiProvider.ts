/**
 * MOCK: Gemini inference STUB. Real connection-test, mocked inference.
 * See `openaiProvider.ts` for the same pattern.
 */

import type { AiProvider, SummarizeArgs } from "./provider";
import type { NormalizedSession } from "@/types/activity";
import type { ClassificationFields } from "@/types/classification";
import type { ProviderConfig } from "./types";
import { MockAiProvider } from "./mockProvider";

export class GeminiAiProvider implements AiProvider {
  readonly id = "gemini-stub";
  private fallback = new MockAiProvider();

  constructor(private config: ProviderConfig) {}

  async classifyBatch(
    sessions: NormalizedSession[]
  ): Promise<ClassificationFields[]> {
    if (!this.config.apiKey) return this.fallback.classifyBatch(sessions);
    // TODO: POST generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
    //       with responseMimeType=application/json + responseSchema.
    return this.fallback.classifyBatch(sessions);
  }

  async summarize(args: SummarizeArgs) {
    if (!this.config.apiKey) return this.fallback.summarize(args);
    return this.fallback.summarize(args);
  }
}
