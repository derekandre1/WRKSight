import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { Card } from "./Card";
import { useSettings } from "@/stores/settingsStore";
import {
  EMPTY_CONFIG,
  type ConnectionStatus,
  type ProviderConfig,
  type ProviderId,
  type TestResult,
} from "@/services/ai/types";
import {
  getProviderDefinition,
  listProviders,
} from "@/services/ai/providers";
import {
  getProviderConfig,
  providerConfigUpdates,
  type SettingsMap,
} from "@/types/settings";

interface SectionState {
  /** Live form state — distinct from saved settings until the user clicks Save. */
  draft: ProviderConfig;
  status: ConnectionStatus;
  message: string;
  showKey: boolean;
}

const initial: SectionState = {
  draft: EMPTY_CONFIG,
  status: "idle",
  message: "",
  showKey: false,
};

export function AiProviderSection() {
  const { settings, set } = useSettings();
  const activeId = settings.ai_active_provider;
  const def = getProviderDefinition(activeId);

  const savedConfig = useMemo(
    () => getProviderConfig(settings, activeId),
    [settings, activeId]
  );

  const [state, setState] = useState<SectionState>(initial);

  // When provider changes (or saved values change), reload the draft.
  useEffect(() => {
    setState({
      draft: hydrateDraft(savedConfig, def.defaults),
      status: initialStatus(def, savedConfig),
      message: "",
      showKey: false,
    });
  }, [activeId, savedConfig, def]);

  const dirty = !configsEqual(state.draft, savedConfig);
  const ready = def.isReady(state.draft);
  const canSave = dirty;
  const canTest = ready && state.status !== "testing" && state.status !== "saving";

  const onProviderChange = async (id: ProviderId) => {
    // Switching the active provider IS a setting change, save immediately.
    await set("ai_active_provider", id);
  };

  const onChangeField = (patch: Partial<ProviderConfig>) => {
    setState((s) => ({
      ...s,
      draft: { ...s.draft, ...patch },
      status: "dirty",
      message: "",
    }));
  };

  const onSave = async () => {
    setState((s) => ({ ...s, status: "saving", message: "" }));
    const updates = providerConfigUpdates(activeId, state.draft);
    for (const [k, v] of updates) {
      await set(k as keyof SettingsMap, v as never);
    }
    setState((s) => ({
      ...s,
      status: "saved",
      message: "Saved locally.",
    }));
  };

  const onTest = async () => {
    setState((s) => ({ ...s, status: "testing", message: "Testing connection…" }));
    let result: TestResult;
    try {
      result = await def.test(state.draft);
    } catch (e) {
      result = {
        status: "request_failed",
        message: e instanceof Error ? e.message : "Test failed.",
      };
    }
    setState((s) => ({ ...s, status: result.status, message: result.message }));
  };

  return (
    <Card
      title="AI provider"
      subtitle="Used for classification, summaries, and accomplishment suggestions."
    >
      <div className="space-y-4">
        <Field
          label="Provider"
          hint="Switch between providers any time. Each one keeps its own credentials."
        >
          <select
            value={activeId}
            onChange={(e) => onProviderChange(e.target.value as ProviderId)}
            className="w-full border border-ink-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {listProviders().map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {p.description}
              </option>
            ))}
          </select>
        </Field>

        {def.fields.apiKey && (
          <Field
            label="API key"
            hint="Stored locally in your WRKSight database. Never synced."
          >
            <PasswordInput
              value={state.draft.apiKey}
              show={state.showKey}
              onChange={(v) => onChangeField({ apiKey: v })}
              onToggleShow={() =>
                setState((s) => ({ ...s, showKey: !s.showKey }))
              }
              placeholder={
                savedConfig.apiKey
                  ? "•••••• (saved — paste a new one to replace)"
                  : "Paste your API key"
              }
            />
          </Field>
        )}

        {def.fields.baseUrl && (
          <Field
            label="Base URL"
            hint={
              activeId === "ollama"
                ? "Local Ollama server. Default is http://localhost:11434."
                : "Endpoint root, e.g. https://api.example.com/v1 (no trailing /chat)."
            }
          >
            <input
              type="text"
              value={state.draft.baseUrl}
              placeholder={def.defaults.baseUrl ?? "https://"}
              onChange={(e) => onChangeField({ baseUrl: e.target.value })}
              className="w-full border border-ink-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </Field>
        )}

        {def.fields.model && (
          <Field
            label="Model"
            hint={
              activeId === "ollama"
                ? "Pull it first with `ollama pull <model>`."
                : "Provider-specific model id."
            }
          >
            <input
              type="text"
              value={state.draft.model}
              placeholder={def.defaults.model ?? "model id"}
              onChange={(e) => onChangeField({ model: e.target.value })}
              className="w-full border border-ink-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </Field>
        )}

        {def.helperText && (
          <div className="flex items-start gap-2 text-xs text-ink-500 bg-ink-50 border border-ink-100 rounded-md p-3">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
            <span>{def.helperText}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <StatusPill status={state.status} message={state.message} />

          <div className="flex gap-2">
            <button
              onClick={onTest}
              disabled={!canTest}
              className={clsx(
                "text-sm px-3 py-2 rounded-md border",
                canTest
                  ? "bg-white border-ink-300 text-ink-700 hover:bg-ink-50"
                  : "bg-ink-50 border-ink-200 text-ink-400 cursor-not-allowed"
              )}
            >
              Test connection
            </button>
            <button
              onClick={onSave}
              disabled={!canSave || state.status === "saving"}
              className={clsx(
                "text-sm px-3 py-2 rounded-md",
                canSave && state.status !== "saving"
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "bg-ink-100 text-ink-400 cursor-not-allowed"
              )}
            >
              {state.status === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-ink-700 mb-1">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-ink-500 mt-1">{hint}</div>}
    </label>
  );
}

function PasswordInput({
  value,
  show,
  onChange,
  onToggleShow,
  placeholder,
}: {
  value: string;
  show: boolean;
  onChange: (v: string) => void;
  onToggleShow: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="w-full border border-ink-200 rounded-md pl-3 pr-10 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-200"
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute inset-y-0 right-0 px-3 text-ink-400 hover:text-ink-700"
        aria-label={show ? "Hide key" : "Show key"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function StatusPill({
  status,
  message,
}: {
  status: ConnectionStatus;
  message: string;
}) {
  const { tone, label } = describeStatus(status);
  const text = message || label;
  return (
    <div
      className={clsx(
        "flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border",
        tone
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={clsx(
          "w-1.5 h-1.5 rounded-full",
          status === "testing" || status === "saving"
            ? "bg-current animate-pulse"
            : "bg-current"
        )}
        aria-hidden
      />
      <span className="truncate max-w-[40ch]">{text}</span>
    </div>
  );
}

function describeStatus(s: ConnectionStatus): { tone: string; label: string } {
  switch (s) {
    case "idle":
      return { tone: "border-ink-200 bg-ink-50 text-ink-500", label: "Ready" };
    case "not_configured":
      return {
        tone: "border-amber-200 bg-amber-50 text-amber-700",
        label: "Not configured",
      };
    case "dirty":
      return {
        tone: "border-amber-200 bg-amber-50 text-amber-700",
        label: "Unsaved changes",
      };
    case "saving":
      return {
        tone: "border-brand-200 bg-brand-50 text-brand-700",
        label: "Saving…",
      };
    case "saved":
      return {
        tone: "border-brand-200 bg-brand-50 text-brand-700",
        label: "Saved locally",
      };
    case "testing":
      return {
        tone: "border-brand-200 bg-brand-50 text-brand-700",
        label: "Testing connection…",
      };
    case "success":
      return {
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
        label: "Connection successful",
      };
    case "invalid_key":
      return {
        tone: "border-red-200 bg-red-50 text-red-700",
        label: "Invalid API key",
      };
    case "request_failed":
      return {
        tone: "border-red-200 bg-red-50 text-red-700",
        label: "Request failed",
      };
  }
}

// ---- helpers --------------------------------------------------------

function configsEqual(a: ProviderConfig, b: ProviderConfig): boolean {
  return a.apiKey === b.apiKey && a.baseUrl === b.baseUrl && a.model === b.model;
}

function hydrateDraft(
  saved: ProviderConfig,
  defaults: Partial<ProviderConfig>
): ProviderConfig {
  return {
    apiKey: saved.apiKey ?? "",
    baseUrl: saved.baseUrl || defaults.baseUrl || "",
    model: saved.model || defaults.model || "",
  };
}

function initialStatus(
  def: ReturnType<typeof getProviderDefinition>,
  saved: ProviderConfig
): ConnectionStatus {
  if (def.id === "mock" || def.id === "disabled") return "idle";
  if (def.isReady(saved)) return "saved";
  return "not_configured";
}
