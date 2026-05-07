/**
 * MOCK: Ollama inference STUB.
 *
 * Real Ollama servers expose /api/chat which is OpenAI-compatible-ish but
 * not identical. For now we delegate to the mock. To wire it up:
 *   POST `${baseUrl}/api/chat` with { model, messages, format: "json" }
 *   and validate the result against the zod schemas in `@/types`.
 */

import type { AiProvider, SummarizeArgs } from "./provider";
import type { NormalizedSession } from "@/types/activity";
import type { ClassificationFields } from "@/types/classification";
import type { ProviderConfig } from "./types";
import { MockAiProvider } from "./mockProvider";

export class OllamaAiProvider implements AiProvider {
  readonly id = "ollama-stub";
  private fallback = new MockAiProvider();

  constructor(private config: ProviderConfig) {}

  async classifyBatch(
    sessions: NormalizedSession[]
  ): Promise<ClassificationFields[]> {
    if (!this.config.baseUrl || !this.config.model)
      return this.fallback.classifyBatch(sessions);
    return this.fallback.classifyBatch(sessions);
  }

  async summarize(args: SummarizeArgs) {
    return this.fallback.summarize(args);
  }
}
