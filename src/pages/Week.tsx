import { useEffect } from "react";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { TimeByCategoryChart } from "@/components/charts/TimeByCategoryChart";
import { TimeByAppChart } from "@/components/charts/TimeByAppChart";
import { StrategicReactiveBar } from "@/components/charts/StrategicReactiveBar";
import { SummaryPanel } from "@/components/SummaryPanel";
import { useActivity } from "@/stores/activityStore";
import { useGoals } from "@/stores/goalsStore";
import { useSettings } from "@/stores/settingsStore";
import { hoursLabel, weekRange } from "@/lib/time";
import { alignAll } from "@/services/goals";
import { Clock, Flame, Target, Zap } from "lucide-react";

export default function Week() {
  const range = weekRange();
  const { settings, loaded } = useSettings();
  const { goals } = useGoals();
  const { insights, joined, loadRange, loadSummaries } = useActivity();

  useEffect(() => {
    if (!loaded) return;
    void loadRange(range, settings);
    void loadSummaries("week", range);
  }, [loaded, range.start, range.end]);

  if (!insights) return <div className="text-ink-400 text-sm">Loading week…</div>;

  const alignments = alignAll(goals, joined);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatTile label="This week" value={hoursLabel(insights.total_hours)} icon={<Clock className="w-4 h-4" />} />
        <StatTile label="Strategic" value={hoursLabel(insights.strategic_hours)} accent="strategic" icon={<Zap className="w-4 h-4" />} />
        <StatTile label="Reactive" value={hoursLabel(insights.reactive_hours)} accent="reactive" icon={<Flame className="w-4 h-4" />} />
        <StatTile
          label="Goals on track"
          value={`${alignments.filter((a) => a.status === "on_track" || a.status === "ahead").length}/${alignments.length}`}
          accent="focus"
          icon={<Target className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card title="Time by category">
          <TimeByCategoryChart data={insights.by_category} />
        </Card>
        <Card title="Top apps" className="col-span-2">
          <TimeByAppChart data={insights.by_app} />
        </Card>
      </div>

      <Card title="Strategic vs reactive (week)">
        <StrategicReactiveBar
          strategicHours={insights.strategic_hours}
          reactiveHours={insights.reactive_hours}
        />
      </Card>

      <SummaryPanel period="week" range={range} goals={goals} />
    </div>
  );
}
