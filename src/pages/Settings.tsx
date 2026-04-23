import { Card } from "@/components/Card";
import { useSettings } from "@/stores/settingsStore";

export default function Settings() {
  const { settings, set } = useSettings();
  return (
    <div className="space-y-6 max-w-2xl">
      <Card title="Capture">
        <Row
          label="Capture interval (ms)"
          hint="How often the tracker samples the active window."
        >
          <input
            type="number"
            min={1000}
            step={1000}
            value={settings.capture_interval_ms}
            onChange={(e) => set("capture_interval_ms", Number(e.target.value))}
            className="border border-ink-200 rounded-md px-2 py-1 w-32"
          />
        </Row>
        <Row
          label="Idle threshold (ms)"
          hint="Idle longer than this ends the current session."
        >
          <input
            type="number"
            min={30_000}
            step={30_000}
            value={settings.idle_threshold_ms}
            onChange={(e) => set("idle_threshold_ms", Number(e.target.value))}
            className="border border-ink-200 rounded-md px-2 py-1 w-32"
          />
        </Row>
      </Card>

      <Card
        title="AI provider"
        subtitle="Used for classification and summaries. All processing is on-device unless you set a cloud provider."
      >
        <Row label="Provider">
          <select
            value={settings.ai_provider}
            onChange={(e) => set("ai_provider", e.target.value as typeof settings.ai_provider)}
            className="border border-ink-200 rounded-md px-2 py-1"
          >
            <option value="mock">Mock (local, no network)</option>
            <option value="anthropic">Anthropic (requires API key)</option>
            <option value="disabled">Disabled</option>
          </select>
        </Row>
        {settings.ai_provider === "anthropic" && (
          <Row label="API key" hint="Stored locally; consider rotating regularly.">
            <input
              type="password"
              value={settings.ai_api_key}
              onChange={(e) => set("ai_api_key", e.target.value)}
              className="border border-ink-200 rounded-md px-2 py-1 w-72"
            />
          </Row>
        )}
      </Card>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-ink-100 last:border-b-0">
      <div>
        <div className="text-sm font-medium text-ink-800">{label}</div>
        {hint && <div className="text-xs text-ink-500">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}
