import clsx from "clsx";
import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: "strategic" | "reactive" | "focus" | "brand";
  icon?: ReactNode;
}) {
  const accentClass = {
    strategic: "text-emerald-700",
    reactive: "text-amber-700",
    focus: "text-indigo-700",
    brand: "text-brand-700",
  }[accent ?? "brand"];

  return (
    <div className="bg-white border border-ink-200 rounded-lg p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-ink-500">
          {label}
        </span>
        {icon && <span className="text-ink-400">{icon}</span>}
      </div>
      <div className={clsx("mt-2 text-2xl font-semibold", accentClass)}>
        {value}
      </div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}
