/**
 * Provider registry.
 *
 * Each entry knows:
 *   - how to render its config in the Settings page (fields + helper text)
 *   - what its sensible defaults are
 *   - how to test connectivity
 *   - how to construct an `AiProvider` for inference
 *
 * Adding a new backend = one entry here. The Settings page never has to
 * change.
 */

import type { AiProvider } from "./provider";
import { MockAiProvider } from "./mockProvider";
import { AnthropicAiProvider } from "./anthropicProvider";
import { OpenAiAiProvider } from "./openaiProvider";
import { GeminiAiProvider } from "./geminiProvider";
import { OllamaAiProvider } from "./ollamaProvider";
import {
  testAnthropic,
  testGemini,
  testOllama,
  testOpenAi,
  testOpenAiCompatible,
  testOpenRouter,
} from "./connectionTests";
import type {
  ProviderConfig,
  ProviderFieldFlags,
  ProviderId,
  TestResult,
} from "./types";

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  /** Short blurb shown beside the label in the dropdown. */
  description: string;
  /** Long help text rendered under the form when this provider is active. */
  helperText?: string;
  fields: ProviderFieldFlags;
  defaults: Partial<ProviderConfig>;
  /** Validate that the user has filled in everything we need. */
  isReady(config: ProviderConfig): boolean;
  test(config: ProviderConfig): Promise<TestResult>;
  build(config: ProviderConfig): AiProvider;
}

const KEYS_LOCALLY = "Keys are stored locally in your WRKSight database. Nothing is sent to a server when you save.";

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderDefinition> = {
  mock: {
    id: "mock",
    label: "Mock (offline)",
    description: "Deterministic local rules — no network, no key.",
    helperText:
      "Uses keyword rules to classify and write summaries. Good enough to demo the pipeline; swap in a real provider for production-quality output.",
    fields: { apiKey: false, baseUrl: false, model: false },
    defaults: {},
    isReady: () => true,
    async test() {
      return { status: "success", message: "Mock provider is always available." };
    },
    build: () => new MockAiProvider(),
  },

  disabled: {
    id: "disabled",
    label: "Disabled",
    description: "Don't run any AI — only show raw activity.",
    helperText:
      "Classification and summary generation are skipped. Dashboards that depend on classification will be sparse.",
    fields: { apiKey: false, baseUrl: false, model: false },
    defaults: {},
    isReady: () => true,
    async test() {
      return { status: "success", message: "AI is disabled." };
    },
    build: () => new MockAiProvider(),
  },

  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude — strong at structured output and long context.",
    helperText: `${KEYS_LOCALLY} Get a key at console.anthropic.com.`,
    fields: { apiKey: true, baseUrl: false, model: true },
    defaults: { model: "claude-haiku-4-5" },
    isReady: (c) => !!c.apiKey.trim(),
    test: testAnthropic,
    build: (c) => new AnthropicAiProvider(c),
  },

  openai: {
    id: "openai",
    label: "OpenAI",
    description: "GPT models via the official OpenAI API.",
    helperText: `${KEYS_LOCALLY} Get a key at platform.openai.com.`,
    fields: { apiKey: true, baseUrl: false, model: true },
    defaults: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
    isReady: (c) => !!c.apiKey.trim(),
    test: testOpenAi,
    build: (c) => new OpenAiAiProvider(c),
  },

  gemini: {
    id: "gemini",
    label: "Google Gemini",
    description: "Google's hosted Gemini models.",
    helperText: `${KEYS_LOCALLY} Get a key at aistudio.google.com.`,
    fields: { apiKey: true, baseUrl: false, model: true },
    defaults: { model: "gemini-2.5-flash" },
    isReady: (c) => !!c.apiKey.trim(),
    test: testGemini,
    build: (c) => new GeminiAiProvider(c),
  },

  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    description: "Single key, many backends — Claude, GPT, Llama, etc.",
    helperText: `${KEYS_LOCALLY} Get a key at openrouter.ai.`,
    fields: { apiKey: true, baseUrl: false, model: true },
    defaults: {
      model: "anthropic/claude-3.5-sonnet",
      baseUrl: "https://openrouter.ai/api/v1",
    },
    isReady: (c) => !!c.apiKey.trim(),
    test: testOpenRouter,
    build: (c) =>
      new OpenAiAiProvider({
        ...c,
        baseUrl: c.baseUrl || "https://openrouter.ai/api/v1",
      }),
  },

  ollama: {
    id: "ollama",
    label: "Ollama / Local",
    description: "Run models locally — no API key, fully offline.",
    helperText:
      "WRKSight will call your local Ollama server. Make sure it's running (default http://localhost:11434) and that you've pulled the model with `ollama pull <model>`. Your data never leaves the machine.",
    fields: { apiKey: false, baseUrl: true, model: true },
    defaults: { baseUrl: "http://localhost:11434", model: "llama3.1" },
    isReady: (c) => !!c.baseUrl.trim() && !!c.model.trim(),
    test: testOllama,
    build: (c) => new OllamaAiProvider(c),
  },

  openai_compatible: {
    id: "openai_compatible",
    label: "Custom (OpenAI-compatible)",
    description: "Any endpoint that speaks the OpenAI Chat Completions API.",
    helperText: `${KEYS_LOCALLY} For self-hosted gateways like LiteLLM, vLLM, LM Studio, or any provider that exposes /chat/completions.`,
    fields: { apiKey: true, baseUrl: true, model: true },
    defaults: { baseUrl: "https://", model: "" },
    isReady: (c) => !!c.apiKey.trim() && !!c.baseUrl.trim() && !!c.model.trim(),
    test: testOpenAiCompatible,
    build: (c) => new OpenAiAiProvider(c),
  },
};

export function getProviderDefinition(id: ProviderId): ProviderDefinition {
  return PROVIDER_REGISTRY[id] ?? PROVIDER_REGISTRY.mock;
}

export function listProviders(): ProviderDefinition[] {
  // Active first (anthropic/openai/...), utility entries last.
  const order: ProviderId[] = [
    "anthropic",
    "openai",
    "gemini",
    "openrouter",
    "ollama",
    "openai_compatible",
    "mock",
    "disabled",
  ];
  return order.map((id) => PROVIDER_REGISTRY[id]);
}
