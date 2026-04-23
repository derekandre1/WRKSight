import { useEffect } from "react";
import { useSettings } from "@/stores/settingsStore";
import { useGoals } from "@/stores/goalsStore";
import { useExclusions } from "@/stores/exclusionsStore";
import { useAccomplishments } from "@/stores/accomplishmentsStore";

/**
 * One-shot app bootstrap. Loads settings, goals, exclusions, accomplishments
 * on mount. Pages load their own date-ranged data separately.
 */
export function useBootstrap() {
  const loadSettings = useSettings((s) => s.load);
  const loadGoals = useGoals((s) => s.load);
  const loadExclusions = useExclusions((s) => s.load);
  const loadAcc = useAccomplishments((s) => s.load);

  useEffect(() => {
    void loadSettings();
    void loadGoals();
    void loadExclusions();
    void loadAcc();
  }, [loadSettings, loadGoals, loadExclusions, loadAcc]);
}
