import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { hoursLabel } from "@/lib/time";

export function TimeByAppChart({
  data,
}: {
  data: Array<{ label: string; hours: number }>;
}) {
  const trimmed = data.slice(0, 8);
  if (trimmed.length === 0) {
    return <EmptyState message="No app activity tracked yet." />;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={trimmed} layout="vertical" margin={{ left: 20 }}>
        <XAxis type="number" stroke="#94a3b8" fontSize={11} tickFormatter={hoursLabel} />
        <YAxis dataKey="label" type="category" stroke="#475569" fontSize={11} width={100} />
        <Tooltip
          formatter={(v: number) => hoursLabel(v)}
          cursor={{ fill: "rgba(148,163,184,0.1)" }}
        />
        <Bar dataKey="hours" fill="#3b82f6" radius={[3, 3, 3, 3]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-ink-400">
      {message}
    </div>
  );
}
