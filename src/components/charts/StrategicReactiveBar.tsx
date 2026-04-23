import { hoursLabel } from "@/lib/time";

export function StrategicReactiveBar({
  strategicHours,
  reactiveHours,
}: {
  strategicHours: number;
  reactiveHours: number;
}) {
  const total = strategicHours + reactiveHours;
  if (total <= 0) {
    return (
      <div className="text-sm text-ink-400">
        Not enough classified activity yet.
      </div>
    );
  }
  const stratPct = (strategicHours / total) * 100;
  const reactPct = 100 - stratPct;
  return (
    <div>
      <div className="h-3 rounded-full overflow-hidden bg-ink-100 flex">
        <div
          className="bg-emerald-500"
          style={{ width: `${stratPct}%` }}
          aria-label={`Strategic ${hoursLabel(strategicHours)}`}
        />
        <div
          className="bg-amber-500"
          style={{ width: `${reactPct}%` }}
          aria-label={`Reactive ${hoursLabel(reactiveHours)}`}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-600">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
          Strategic · {hoursLabel(strategicHours)} ({Math.round(stratPct)}%)
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
          Reactive · {hoursLabel(reactiveHours)} ({Math.round(reactPct)}%)
        </span>
      </div>
    </div>
  );
}
