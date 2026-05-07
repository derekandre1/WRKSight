import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { ipc } from "@/lib/tauri";
import { runNormalization } from "@/services/normalizationRunner";
import { useSettings } from "@/stores/settingsStore";
import { dayRange } from "@/lib/time";
import { fmtDateTime } from "@/lib/format";
import type { Diagnostics as DiagShape } from "@/types/diagnostics";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  PauseCircle,
  RefreshCw,
} from "lucide-react";

const POLL_MS = 2_000;

export default function DiagnosticsPage() {
  const { settings } = useSettings();
  const [diag, setDiag] = useState<DiagShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [lastNormalize, setLastNormalize] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await ipc.getDiagnostics();
        if (!cancelled) {
          setDiag(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const onForceNormalize = async () => {
    setNormalizing(true);
    try {
      const stats = await runNormalization(dayRange(), settings);
      setLastNormalize(
        `${stats.raw_events} raw → ${stats.sessions_written} sessions in ${stats.duration_ms.toFixed(0)}ms`
      );
    } catch (e) {
      setLastNormalize(`failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setNormalizing(false);
    }
  };

  if (error) {
    return (
      <Card title="Diagnostics" subtitle="Live tracker telemetry">
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          Could not load diagnostics: {error}
        </div>
      </Card>
    );
  }

  if (!diag) {
    return (
      <Card title="Diagnostics" subtitle="Live tracker telemetry">
        <div className="text-sm text-ink-400">Connecting…</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="Tracker status"
        subtitle="Updates every 2 seconds. Use this view to confirm the capture loop is alive on Windows / macOS / Linux."
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat
            label="Tracker"
            tone={diag.paused ? "warn" : "ok"}
            value={diag.paused ? "Paused" : "Running"}
            sub={
              diag.last_tick_at
                ? `last tick ${msAgo(diag.last_tick_at)}`
                : "never ticked"
            }
            icon={
              diag.paused ? (
                <PauseCircle className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )
            }
          />
          <Stat
            label="Last capture"
            tone={diag.last_capture_at ? "ok" : "warn"}
            value={diag.last_capture_at ? msAgo(diag.last_capture_at) : "never"}
            sub={diag.private_mode ? "private mode on" : undefined}
          />
          <Stat
            label="Capture error"
            tone={diag.last_capture_error ? "err" : "ok"}
            value={diag.last_capture_error ? "Yes" : "None"}
            sub={diag.last_capture_error ?? undefined}
            icon={
              diag.last_capture_error ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )
            }
          />
          <Stat
            label="Raw events today"
            value={String(diag.raw_count_today)}
            sub={`${diag.raw_count_total} total`}
          />
          <Stat
            label="Sessions today"
            value={String(diag.session_count_today)}
            sub={`${diag.session_count_total} total`}
          />
          <Stat
            label="Platform"
            value={diag.platform}
            sub={diag.db_path}
          />
        </div>
      </Card>

      <Card title="Latest captured raw event" subtitle="Most recent row in raw_activity_events">
        {diag.last_raw_event ? (
          <RawEventDetail e={diag.last_raw_event} />
        ) : (
          <Empty message="No raw events have been written. Either tracking is paused, the foreground window is excluded, or the OS-level capture is failing — check 'Capture error' above." />
        )}
      </Card>

      <Card title="Latest normalized session" subtitle="Most recent row in normalized_sessions">
        {diag.latest_session ? (
          <SessionDetail e={diag.latest_session} />
        ) : (
          <Empty message="No normalized sessions yet. If raw events exist above, click 'Force normalize today' to materialize them." />
        )}
      </Card>

      <Card title="Manual actions" subtitle="Useful while debugging">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void onForceNormalize()}
            disabled={normalizing}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${normalizing ? "animate-spin" : ""}`}
            />
            {normalizing ? "Normalizing…" : "Force normalize today"}
          </button>
          {lastNormalize && (
            <span className="text-xs text-ink-500">{lastNormalize}</span>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "err" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneClass = {
    ok: "text-emerald-700",
    warn: "text-amber-700",
    err: "text-red-700",
    neutral: "text-ink-700",
  }[tone];
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-500">
        {icon ?? <CircleDashed className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className={`mt-1 text-base font-semibold ${toneClass}`}>{value}</div>
      {sub && (
        <div className="text-xs text-ink-500 mt-0.5 break-all">{sub}</div>
      )}
    </div>
  );
}

function RawEventDetail({ e }: { e: DiagShape["last_raw_event"] }) {
  if (!e) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <Row k="App" v={e.app_name} />
      <Row k="Window title" v={e.window_title || "(empty)"} />
      <Row k="Browser domain" v={e.browser_domain ?? "—"} />
      <Row k="Started" v={fmtDateTime(e.started_at)} />
      <Row
        k="Ended"
        v={e.ended_at ? fmtDateTime(e.ended_at) : "open (still active)"}
      />
      <Row k="Idle?" v={e.is_idle ? "yes" : "no"} />
      <Row k="Private?" v={e.is_private_window ? "yes" : "no"} />
    </dl>
  );
}

function SessionDetail({ e }: { e: DiagShape["latest_session"] }) {
  if (!e) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <Row k="App" v={e.app_name} />
      <Row k="Title root" v={e.title_root || "(empty)"} />
      <Row k="Browser domain" v={e.browser_domain ?? "—"} />
      <Row k="Started" v={fmtDateTime(e.started_at)} />
      <Row k="Ended" v={fmtDateTime(e.ended_at)} />
      <Row k="Duration" v={`${(e.duration_ms / 1000).toFixed(1)}s`} />
      <Row k="Interruptions" v={String(e.interruption_count)} />
      <Row k="Context switches" v={String(e.context_switch_count)} />
      <Row k="Classified?" v={e.classified ? "yes" : "no"} />
    </dl>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <dt className="text-ink-500">{k}</dt>
      <dd className="text-ink-800 font-mono break-all">{v}</dd>
    </>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="text-sm text-ink-500 bg-ink-50 border border-ink-100 rounded-md p-3">
      {message}
    </div>
  );
}

function msAgo(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 0) return "just now";
  if (delta < 1500) return "just now";
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}
