import { PauseCircle, PlayCircle, EyeOff, Eye } from "lucide-react";
import { useSettings } from "@/stores/settingsStore";
import clsx from "clsx";

export function TopBar() {
  const { settings, setPaused, setPrivate } = useSettings();
  const paused = settings.tracking_paused;
  const priv = settings.private_mode;

  return (
    <header className="h-14 border-b border-ink-200 bg-white flex items-center px-5 gap-3">
      <div
        className={clsx(
          "h-2 w-2 rounded-full",
          paused ? "bg-ink-300" : "bg-emerald-500 animate-pulse"
        )}
        aria-hidden
      />
      <span className="text-sm text-ink-700">
        {paused ? "Tracking paused" : "Tracking"}
        {priv && !paused && (
          <span className="ml-2 text-ink-400">· private mode</span>
        )}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          className="flex items-center gap-2 text-sm text-ink-600 hover:text-ink-900 px-3 py-1.5 rounded-md hover:bg-ink-100"
          onClick={() => setPrivate(!priv)}
          title={priv ? "Turn off private mode" : "Turn on private mode"}
        >
          {priv ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {priv ? "Private" : "Private mode"}
        </button>
        <button
          className={clsx(
            "flex items-center gap-2 text-sm px-3 py-1.5 rounded-md",
            paused
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "bg-ink-100 text-ink-700 hover:bg-ink-200"
          )}
          onClick={() => setPaused(!paused)}
        >
          {paused ? (
            <>
              <PlayCircle className="w-4 h-4" /> Resume
            </>
          ) : (
            <>
              <PauseCircle className="w-4 h-4" /> Pause
            </>
          )}
        </button>
      </div>
    </header>
  );
}
