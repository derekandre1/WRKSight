import type { AiProvider } from "./provider";
import { MockAiProvider } from "./mockProvider";
import { AnthropicAiProvider } from "./anthropicProvider";
import type { SettingsMap } from "@/types";

export function getAiProvider(settings: SettingsMap): AiProvider {
  if (settings.ai_provider === "disabled") return new MockAiProvider();
  if (settings.ai_provider === "anthropic") {
    return new AnthropicAiProvider(settings.ai_api_key);
  }
  return new MockAiProvider();
}

export * from "./provider";
export { MockAiProvider } from "./mockProvider";
export { AnthropicAiProvider } from "./anthropicProvider";
