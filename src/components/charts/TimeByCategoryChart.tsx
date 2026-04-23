import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { hoursLabel } from "@/lib/time";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#64748b",
];

export function TimeByCategoryChart({
  data,
}: {
  data: Array<{ label: string; hours: number }>;
}) {
  if (data.length === 0)
    return (
      <div className="h-[240px] flex items-center justify-center text-sm text-ink-400">
        Nothing categorized yet.
      </div>
    );
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="hours"
          nameKey="label"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => hoursLabel(v)} />
      </PieChart>
    </ResponsiveContainer>
  );
}
