import type { AiProvider } from "./provider";
import { MockAiProvider } from "./mockProvider";
import { getProviderDefinition } from "./providers";
import type { SettingsMap } from "@/types";
import { getProviderConfig } from "@/types/settings";

/**
 * Build the AiProvider for inference based on current settings. The
 * Settings page (Save / Test) and the activity pipeline (classify /
 * summarize) call the same factory, so swapping providers is atomic.
 */
export function getAiProvider(settings: SettingsMap): AiProvider {
  const id = settings.ai_active_provider;
  const def = getProviderDefinition(id);
  if (id === "disabled") return new MockAiProvider(); // safe no-op
  const config = getProviderConfig(settings, id);
  return def.build(config);
}

export * from "./provider";
export * from "./types";
export { PROVIDER_REGISTRY, listProviders, getProviderDefinition } from "./providers";
export { MockAiProvider } from "./mockProvider";
export { AnthropicAiProvider } from "./anthropicProvider";
export { OpenAiAiProvider } from "./openaiProvider";
export { GeminiAiProvider } from "./geminiProvider";
export { OllamaAiProvider } from "./ollamaProvider";
