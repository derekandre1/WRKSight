import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { useAccomplishments } from "@/stores/accomplishmentsStore";
import { useActivity } from "@/stores/activityStore";
import { useSettings } from "@/stores/settingsStore";
import { accomplishmentCandidates } from "@/services/insights";
import { weekRange, msToHours, hoursLabel } from "@/lib/time";
import { fmtDate } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

export default function Accomplishments() {
  const range = weekRange();
  const { settings, loaded } = useSettings();
  const { joined, loadRange } = useActivity();
  const { accomplishments, save, remove } = useAccomplishments();

  useEffect(() => {
    if (!loaded) return;
    void loadRange(range, settings);
  }, [loaded, range.start, range.end]);

  const candidates = useMemo(
    () => accomplishmentCandidates(joined).slice(0, 8),
    [joined]
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const addManual = async () => {
    if (!title.trim()) return;
    await save({
      id: null,
      title: title.trim(),
      description: description.trim(),
      evidence_json: "{}",
      occurred_on: Date.now(),
      source: "user",
      created_at: Date.now(),
    });
    setTitle("");
    setDescription("");
  };

  const acceptCandidate = async (c: (typeof candidates)[number]) => {
    await save({
      id: null,
      title: c.classification?.project
        ? `${c.classification.project}: ${c.title_root || "focused block"}`
        : c.title_root || c.app_name,
      description: `Sustained ${hoursLabel(msToHours(c.duration_ms))} session, ${
        c.interruption_count
      } interruption(s).`,
      evidence_json: JSON.stringify({ session_ids: c.id != null ? [c.id] : [] }),
      occurred_on: c.started_at,
      source: "ai_suggested",
      created_at: Date.now(),
    });
  };

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card title="Suggested this week" className="col-span-2">
        {candidates.length === 0 && (
          <p className="text-sm text-ink-500">
            Nothing worth flagging yet. Candidates appear after sustained,
            strategic-leaning sessions.
          </p>
        )}
        <div className="space-y-2">
          {candidates.map((c) => (
            <div
              key={c.id}
              className="border border-ink-200 rounded-md p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-800 truncate">
                  {c.classification?.project || c.title_root || c.app_name}
                </div>
                <div className="text-xs text-ink-500">
                  {fmtDate(c.started_at)} · {hoursLabel(msToHours(c.duration_ms))} ·{" "}
                  {c.classification?.category ?? "Unknown"}
                </div>
              </div>
              <button
                onClick={() => acceptCandidate(c)}
                className="text-xs px-3 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Save
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Add manually">
        <input
          className="w-full border border-ink-200 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
          placeholder="Accomplishment title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full border border-ink-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          placeholder="Short description (optional)"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          onClick={addManual}
          className="mt-3 w-full text-sm px-3 py-2 rounded-md bg-ink-800 text-white hover:bg-ink-900"
        >
          Save accomplishment
        </button>
      </Card>

      <Card title="Archive" className="col-span-3">
        {accomplishments.length === 0 && (
          <p className="text-sm text-ink-500">Saved accomplishments will appear here.</p>
        )}
        <div className="divide-y divide-ink-100">
          {accomplishments.map((a) => (
            <div key={a.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-800">{a.title}</div>
                {a.description && (
                  <div className="text-xs text-ink-600 mt-1">{a.description}</div>
                )}
                <div className="text-xs text-ink-400 mt-1">
                  {fmtDate(a.occurred_on)} · {a.source === "user" ? "You" : "Suggested"}
                </div>
              </div>
              <button
                onClick={() => a.id && remove(a.id)}
                className="text-ink-400 hover:text-red-600"
                title="Remove"
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
