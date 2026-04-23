import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { useGoals } from "@/stores/goalsStore";
import { useActivity } from "@/stores/activityStore";
import { useSettings } from "@/stores/settingsStore";
import { weekRange } from "@/lib/time";
import { alignAll } from "@/services/goals";
import { Trash2 } from "lucide-react";
import { WORK_CATEGORIES } from "@/types/classification";
import type { Goal, GoalDirection, GoalTargetKind } from "@/types/goal";

export default function GoalsPage() {
  const range = weekRange();
  const { settings, loaded } = useSettings();
  const { goals, save, remove } = useGoals();
  const { joined, loadRange } = useActivity();

  useEffect(() => {
    if (!loaded) return;
    void loadRange(range, settings);
  }, [loaded, range.start, range.end]);

  const align = alignAll(goals, joined);

  return (
    <div className="space-y-6">
      <Card title="Your goals" subtitle="Weekly targets. Alignment is computed from classified time.">
        {goals.length === 0 && (
          <p className="text-sm text-ink-500">
            You have no goals yet. Add one below.
          </p>
        )}
        <div className="space-y-2">
          {goals.map((g) => {
            const a = align.find((x) => x.goal.id === g.id);
            return (
              <div
                key={g.id}
                className="border border-ink-200 rounded-md p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-800">{g.label}</div>
                  <div className="text-xs text-ink-500 mt-0.5">
                    {g.direction === "increase" ? "↑ more" : "↓ less"} ·{" "}
                    {g.target_kind}
                    {g.target_value ? ` · ${g.target_value}` : ""}
                    {g.target_hours != null ? ` · ${g.target_hours}h/wk` : ""}
                  </div>
                  {a && <div className="text-xs text-ink-600 mt-1">{a.note}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {a && (
                    <span
                      className={
                        "text-xs px-2 py-0.5 rounded-full " +
                        {
                          ahead: "bg-emerald-100 text-emerald-700",
                          on_track: "bg-brand-100 text-brand-700",
                          behind: "bg-amber-100 text-amber-700",
                          unknown: "bg-ink-100 text-ink-500",
                        }[a.status]
                      }
                    >
                      {a.status.replace("_", " ")}
                    </span>
                  )}
                  <button
                    onClick={() => g.id && remove(g.id)}
                    className="text-ink-400 hover:text-red-600"
                    aria-label="Remove goal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Add a goal">
        <NewGoalForm
          onSave={async (g) => {
            await save(g);
          }}
        />
      </Card>
    </div>
  );
}

function NewGoalForm({ onSave }: { onSave: (g: Goal) => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [direction, setDirection] = useState<GoalDirection>("increase");
  const [kind, setKind] = useState<GoalTargetKind>("strategic");
  const [value, setValue] = useState("");
  const [hours, setHours] = useState<string>("");

  const submit = async () => {
    if (!label.trim()) return;
    await onSave({
      id: null,
      label: label.trim(),
      direction,
      target_kind: kind,
      target_value: kind === "category" || kind === "project" ? value || null : null,
      target_hours: hours ? Number(hours) : null,
      active: true,
      created_at: Date.now(),
    });
    setLabel("");
    setValue("");
    setHours("");
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <input
        className="col-span-5 border border-ink-200 rounded-md px-3 py-2 text-sm"
        placeholder="Spend more time on Q2 roadmap"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <select
        className="col-span-2 border border-ink-200 rounded-md px-2 py-2 text-sm"
        value={direction}
        onChange={(e) => setDirection(e.target.value as GoalDirection)}
      >
        <option value="increase">↑ Increase</option>
        <option value="decrease">↓ Decrease</option>
      </select>
      <select
        className="col-span-2 border border-ink-200 rounded-md px-2 py-2 text-sm"
        value={kind}
        onChange={(e) => setKind(e.target.value as GoalTargetKind)}
      >
        <option value="strategic">Strategic work</option>
        <option value="reactive">Reactive work</option>
        <option value="category">Category</option>
        <option value="project">Project</option>
      </select>
      {(kind === "category" || kind === "project") && (
        <div className="col-span-12">
          {kind === "category" ? (
            <select
              className="w-full border border-ink-200 rounded-md px-2 py-2 text-sm"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="">— pick a category —</option>
              {WORK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="w-full border border-ink-200 rounded-md px-3 py-2 text-sm"
              placeholder="Project name (matches classification)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </div>
      )}
      <input
        className="col-span-2 border border-ink-200 rounded-md px-3 py-2 text-sm"
        placeholder="hrs/wk"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
      />
      <button
        onClick={submit}
        className="col-span-1 text-sm px-3 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700"
      >
        Add
      </button>
    </div>
  );
}
