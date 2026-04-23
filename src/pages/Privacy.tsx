import { useState } from "react";
import { Card } from "@/components/Card";
import { useExclusions } from "@/stores/exclusionsStore";
import { useSettings } from "@/stores/settingsStore";
import { validateExclusion } from "@/services/exclusions";
import { Trash2, ShieldCheck } from "lucide-react";
import type { ExclusionKind } from "@/types/exclusion";

export default function Privacy() {
  const { exclusions, add, remove } = useExclusions();
  const { settings, setPaused, setPrivate, set } = useSettings();

  const [kind, setKind] = useState<ExclusionKind>("app");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const msg = validateExclusion(kind, value);
    if (msg) {
      setErr(msg);
      return;
    }
    setErr(null);
    await add(kind, value.trim(), note.trim() || undefined);
    setValue("");
    setNote("");
  };

  return (
    <div className="space-y-6">
      <Card title="Privacy controls" subtitle="Nothing about you leaves this device.">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-3 border border-ink-200 rounded-md p-3">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600" />
            <div>
              <div className="font-medium text-ink-800">No screenshots</div>
              <div className="text-ink-500 text-xs">
                Only window metadata is captured.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 border border-ink-200 rounded-md p-3">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600" />
            <div>
              <div className="font-medium text-ink-800">No keystrokes</div>
              <div className="text-ink-500 text-xs">Ever.</div>
            </div>
          </div>
          <div className="flex items-start gap-3 border border-ink-200 rounded-md p-3">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600" />
            <div>
              <div className="font-medium text-ink-800">Local SQLite</div>
              <div className="text-ink-500 text-xs">No cloud. No telemetry.</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Tracking">
          <ToggleRow
            label="Pause tracking"
            sub="Nothing is recorded until you resume."
            value={settings.tracking_paused}
            onChange={setPaused}
          />
          <ToggleRow
            label="Private mode"
            sub="Durations are tracked but window titles are dropped."
            value={settings.private_mode}
            onChange={setPrivate}
          />
        </Card>
        <Card title="Retention">
          <label className="text-sm text-ink-700">
            Keep raw events for
            <input
              type="number"
              className="ml-2 w-20 border border-ink-200 rounded-md px-2 py-1 text-sm"
              value={settings.retention_days}
              onChange={(e) => void set("retention_days", Number(e.target.value))}
            />
            days
          </label>
          <p className="text-xs text-ink-500 mt-2">
            Normalized sessions and summaries are kept longer for reviews.
            A daily compaction task enforces this.
          </p>
        </Card>
      </div>

      <Card
        title="Exclusions"
        subtitle="Excluded inputs are dropped by the Rust layer before anything is persisted."
      >
        <div className="grid grid-cols-12 gap-3 mb-4">
          <select
            className="col-span-2 border border-ink-200 rounded-md px-2 py-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as ExclusionKind)}
          >
            <option value="app">App</option>
            <option value="domain">Domain</option>
            <option value="title_glob">Title pattern</option>
          </select>
          <input
            className="col-span-4 border border-ink-200 rounded-md px-3 py-2 text-sm"
            placeholder={
              kind === "app"
                ? "1Password"
                : kind === "domain"
                ? "reddit.com"
                : "incognito"
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <input
            className="col-span-4 border border-ink-200 rounded-md px-3 py-2 text-sm"
            placeholder="Optional note (e.g. 'personal banking')"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            onClick={submit}
            className="col-span-2 text-sm px-3 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700"
          >
            Add exclusion
          </button>
        </div>
        {err && <div className="text-sm text-red-600 mb-3">{err}</div>}
        <div className="divide-y divide-ink-100">
          {exclusions.map((e) => (
            <div key={e.id} className="py-2 flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-xs uppercase tracking-wider text-ink-500 mr-3">
                  {e.kind}
                </span>
                <span className="text-sm text-ink-800">{e.value}</span>
                {e.note && <span className="text-xs text-ink-400 ml-2">— {e.note}</span>}
              </div>
              <button
                onClick={() => e.id && remove(e.id)}
                className="text-ink-400 hover:text-red-600"
                aria-label="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between py-2 cursor-pointer">
      <div>
        <div className="text-sm text-ink-800 font-medium">{label}</div>
        <div className="text-xs text-ink-500">{sub}</div>
      </div>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4"
      />
    </label>
  );
}
