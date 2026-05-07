import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { TimeByAppChart } from "@/components/charts/TimeByAppChart";
import { TimeByCategoryChart } from "@/components/charts/TimeByCategoryChart";
import { StrategicReactiveBar } from "@/components/charts/StrategicReactiveBar";
import { SummaryPanel } from "@/components/SummaryPanel";
import { PausedBanner } from "@/components/PausedBanner";
import { useActivity } from "@/stores/activityStore";
import { useSettings } from "@/stores/settingsStore";
import { useGoals } from "@/stores/goalsStore";
import { dayRange, hoursLabel } from "@/lib/time";
import { alignAll } from "@/services/goals";
import { Activity, CircleDot, Clock, Flame, RefreshCw, Zap } from "lucide-react";

export default function Today() {
  const range = dayRange();
  const { settings, loaded } = useSettings();
  const { goals } = useGoals();
  const { insights, joined, loadRange, loadSummaries } = useActivity();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(0);

  const refresh = async () => {
    if (!loaded) return;
    setRefreshing(true);
    try {
      await loadRange(range, settings);
      void loadSummaries("day", range);
      setLastRefreshAt(Date.now());
    } finally {
      setRefreshing(false);
    }
  };

  // Initial load + auto-refresh every 30s while the tab is open. Cheap:
  // each tick re-runs normalization on a single day's raw events.
  useEffect(() => {
    if (!loaded) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, range.start, range.end]);

  if (!insights) {
    return (
      <div className="space-y-6">
        <PausedBanner />
        <div className="text-ink-400 text-sm">Loading today…</div>
      </div>
    );
  }

  const alignments = alignAll(goals, joined);

  return (
    <div className="space-y-6">
      <PausedBanner />

      <div className="flex items-center justify-between">
        <div className="text-xs text-ink-500">
          {lastRefreshAt
            ? `Updated ${new Date(lastRefreshAt).toLocaleTimeString()}`
            : "Loading…"}
          {" · auto-refreshes every 30s"}
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-200 bg-white hover:bg-ink-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Refreshing…" : "Refresh tracking data"}
        </button>
      </div>

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
