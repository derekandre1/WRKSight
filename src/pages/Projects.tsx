import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { useActivity } from "@/stores/activityStore";
import { useSettings } from "@/stores/settingsStore";
import { weekRange, hoursLabel, msToHours } from "@/lib/time";

export default function Projects() {
  const range = weekRange();
  const { settings, loaded } = useSettings();
  const { joined, loadRange } = useActivity();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    void loadRange(range, settings);
  }, [loaded, range.start, range.end]);

  const byProject = useMemo(() => {
    const m = new Map<string, { ms: number; sessions: number }>();
    for (const s of joined) {
      const p = s.classification?.project ?? "(Unclassified)";
      const cur = m.get(p) ?? { ms: 0, sessions: 0 };
      cur.ms += s.duration_ms;
      cur.sessions += 1;
      m.set(p, cur);
    }
    return [...m.entries()]
      .map(([name, v]) => ({ name, hours: msToHours(v.ms), sessions: v.sessions }))
      .sort((a, b) => b.hours - a.hours);
  }, [joined]);

  const detail = useMemo(() => {
    if (!selected) return [];
    return joined.filter(
      (s) => (s.classification?.project ?? "(Unclassified)") === selected
    );
  }, [joined, selected]);

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card title="Projects this week" className="col-span-1">
        {byProject.length === 0 && (
          <p className="text-sm text-ink-500">No projects inferred yet.</p>
        )}
        <ul className="space-y-1">
          {byProject.map((p) => (
            <li key={p.name}>
              <button
                onClick={() => setSelected(p.name)}
                className={
                  "w-full text-left px-3 py-2 rounded-md hover:bg-ink-100 flex items-center justify-between " +
                  (selected === p.name ? "bg-brand-50 text-brand-700" : "")
                }
              >
                <span className="truncate mr-2">{p.name}</span>
                <span className="text-xs text-ink-500">{hoursLabel(p.hours)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={selected ?? "Select a project"} className="col-span-2">
        {!selected && <p className="text-sm text-ink-500">Pick a project to see sessions.</p>}
        {selected && detail.length === 0 && <p className="text-sm text-ink-500">No sessions.</p>}
        {selected && detail.length > 0 && (
          <div className="divide-y divide-ink-100">
            {detail.slice(0, 30).map((s) => (
              <div key={s.id} className="py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm text-ink-800 truncate">
                    {s.title_root || s.app_name}
                  </div>
                  <div className="text-xs text-ink-500 flex gap-2">
                    <span>{s.app_name}</span>
                    {s.classification?.category && (
                      <span>· {s.classification.category}</span>
                    )}
                    {s.classification?.task && <span>· {s.classification.task}</span>}
                  </div>
                </div>
                <div className="text-xs text-ink-600">{hoursLabel(msToHours(s.duration_ms))}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
