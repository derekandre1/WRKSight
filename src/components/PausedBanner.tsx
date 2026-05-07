import { PlayCircle, PauseCircle } from "lucide-react";
import { useSettings } from "@/stores/settingsStore";

/**
 * Top-of-page banner that makes it impossible to miss the fact that
 * tracking is paused. The Settings/TopBar pause indicator was too quiet
 * — users were staring at empty dashboards not realizing they were the
 * cause.
 */
export function PausedBanner() {
  const { settings, setPaused } = useSettings();
  if (!settings.tracking_paused) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
      <PauseCircle className="w-5 h-5 mt-0.5 text-amber-600 shrink-0" />
      <div className="flex-1">
        <div className="text-sm font-semibold text-amber-900">
          Tracking is paused
        </div>
        <div className="text-xs text-amber-800 mt-0.5">
          WRKSight isn't capturing any activity right now. Resume to start
          recording the foreground app and window into your local database.
        </div>
      </div>
      <button
        onClick={() => setPaused(false)}
        className="text-sm px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-1.5 shrink-0"
      >
        <PlayCircle className="w-4 h-4" /> Resume tracking
      </button>
    </div>
  );
}
