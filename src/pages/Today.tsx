import { useEffect } from "react";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { TimeByAppChart } from "@/components/charts/TimeByAppChart";
import { TimeByCategoryChart } from "@/components/charts/TimeByCategoryChart";
import { StrategicReactiveBar } from "@/components/charts/StrategicReactiveBar";
import { SummaryPanel } from "@/components/SummaryPanel";
import { useActivity } from "@/stores/activityStore";
import { useSettings } from "@/stores/settingsStore";
import { useGoals } from "@/stores/goalsStore";
import { dayRange, hoursLabel } from "@/lib/time";
import { alignAll } from "@/services/goals";
import { Activity, CircleDot, Clock, Flame, Zap } from "lucide-react";

export default function Today() {
  const range = dayRange();
  const { settings, loaded } = useSettings();
  const { goals } = useGoals();
  const { insights, joined, loadRange, loadSummaries } = useActivity();

  useEffect(() => {
    if (!loaded) return;
    void loadRange(range, settings);
    void loadSummaries("day", range);
  }, [loaded, range.start, range.end]);

  if (!insights) {
    return <div className="text-ink-400 text-sm">Loading today…</div>;
  }

  const alignments = alignAll(goals, joined);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatTile
          label="Tracked"
          value={hoursLabel(insights.total_hours)}
          sub={`${joined.length} sessions`}
          icon={<Clock className="w-4 h-4" />}
        />
        <StatTile
          label="Strategic"
          value={hoursLabel(insights.strategic_hours)}
          accent="strategic"
          icon={<Zap className="w-4 h-4" />}
        />
        <StatTile
          label="Reactive"
          value={hoursLabel(insights.reactive_hours)}
          accent="reactive"
          icon={<Flame className="w-4 h-4" />}
        />
        <StatTile
          label="Focus ratio"
          value={`${Math.round(insights.focus_ratio * 100)}%`}
          sub={`${insights.interruption_count} interruptions`}
          accent="focus"
          icon={<Activity className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card title="Time by app" className="col-span-2">
          <TimeByAppChart data={insights.by_app} />
        </Card>
        <Card title="Time by category">
          <TimeByCategoryChart data={insights.by_category} />
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card title="Strategic vs reactive" className="col-span-2">
          <StrategicReactiveBar
            strategicHours={insights.strategic_hours}
            reactiveHours={insights.reactive_hours}
          />
          <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
            <div className="flex items-start gap-2">
              <CircleDot className="w-3 h-3 mt-0.5 text-ink-400" />
              <span>
                <b className="text-ink-800 block">
                  {hoursLabel(insights.uncategorized_hours)}
                </b>
                uncategorized
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CircleDot className="w-3 h-3 mt-0.5 text-ink-400" />
              <span>
                <b className="text-ink-800 block">
                  {insights.fragmentation_index}
                </b>
                context switches / hr
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CircleDot className="w-3 h-3 mt-0.5 text-ink-400" />
              <span>
                <b className="text-ink-800 block">
                  {insights.top_interruptions[0]?.source ?? "—"}
                </b>
                top interrupter
              </span>
            </div>
          </div>
        </Card>

        <Card title="Goal alignment (today)">
          {alignments.length === 0 && (
            <p className="text-sm text-ink-500">
              No active goals. Define some in{" "}
              <a href="/goals" className="text-brand-600 underline-offset-2 hover:underline">
                Goals
              </a>
              .
            </p>
          )}
          <ul className="space-y-2">
            {alignments.map((a) => (
              <li
                key={a.goal.id ?? a.goal.label}
                className="flex items-start justify-between gap-2"
              >
                <div>
                  <div className="text-sm text-ink-800 font-medium">
                    {a.goal.label}
                  </div>
                  <div className="text-xs text-ink-500">{a.note}</div>
                </div>
                <StatusPill status={a.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <SummaryPanel period="day" range={range} goals={goals} />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ahead: "bg-emerald-100 text-emerald-700",
    on_track: "bg-brand-100 text-brand-700",
    behind: "bg-amber-100 text-amber-700",
    unknown: "bg-ink-100 text-ink-500",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${map[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}
