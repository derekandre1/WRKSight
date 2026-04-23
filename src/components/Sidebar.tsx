import { NavLink } from "react-router-dom";
import {
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Target,
  FolderKanban,
  Settings as SettingsIcon,
} from "lucide-react";
import clsx from "clsx";

const items = [
  { to: "/today", label: "Today", icon: LayoutDashboard },
  { to: "/week", label: "This Week", icon: CalendarDays },
  { to: "/month", label: "This Month", icon: CalendarRange },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/accomplishments", label: "Accomplishments", icon: Sparkles },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/privacy", label: "Privacy", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-ink-200 bg-white flex flex-col">
      <div className="h-14 px-5 flex items-center border-b border-ink-200">
        <span className="font-semibold tracking-tight text-ink-900">WRKSight</span>
        <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-400">
          local
        </span>
      </div>
      <nav className="flex-1 py-4 px-2 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-600 hover:bg-ink-100"
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 text-xs text-ink-400 border-t border-ink-200">
        No screenshots. No keystrokes. All local.
      </div>
    </aside>
  );
}
