import { useEffect } from "react";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { TimeByCategoryChart } from "@/components/charts/TimeByCategoryChart";
import { StrategicReactiveBar } from "@/components/charts/StrategicReactiveBar";
import { SummaryPanel } from "@/components/SummaryPanel";
import { useActivity } from "@/stores/activityStore";
import { useGoals } from "@/stores/goalsStore";
import { useSettings } from "@/stores/settingsStore";
import { hoursLabel, monthRange } from "@/lib/time";
import { Clock, Flame, Zap } from "lucide-react";

export default function Month() {
  const range = monthRange();
  const { settings, loaded } = useSettings();
  const { goals } = useGoals();
  const { insights, loadRange, loadSummaries } = useActivity();

  useEffect(() => {
    if (!loaded) return;
    void loadRange(range, settings);
    void loadSummaries("month", range);
  }, [loaded, range.start, range.end]);

  if (!insights) return <div className="text-ink-400 text-sm">Loading month…</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="This month" value={hoursLabel(insights.total_hours)} icon={<Clock className="w-4 h-4" />} />
        <StatTile label="Strategic" value={hoursLabel(insights.strategic_hours)} accent="strategic" icon={<Zap className="w-4 h-4" />} />
        <StatTile label="Reactive" value={hoursLabel(insights.reactive_hours)} accent="reactive" icon={<Flame className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Where time went">
          <TimeByCategoryChart data={insights.by_category} />
        </Card>
        <Card title="Strategic vs reactive">
          <StrategicReactiveBar
            strategicHours={insights.strategic_hours}
            reactiveHours={insights.reactive_hours}
          />
          <p className="mt-4 text-xs text-ink-500">
            Aim for a higher share of strategic hours when goals call for it.
          </p>
        </Card>
      </div>

      <SummaryPanel period="month" range={range} goals={goals} />
    </div>
  );
}
