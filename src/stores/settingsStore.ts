import { create } from "zustand";
import { ipc } from "@/lib/tauri";
import { DEFAULT_SETTINGS, parseSettings, type SettingsMap } from "@/types";

interface SettingsState {
  settings: SettingsMap;
  loaded: boolean;
  load: () => Promise<void>;
  set: <K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) => Promise<void>;
  setPaused: (p: boolean) => Promise<void>;
  setPrivate: (p: boolean) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    const pairs = await ipc.getSettings();
    set({ settings: parseSettings(pairs), loaded: true });
  },
  async set(key, value) {
    const str =
      typeof value === "boolean" ? (value ? "true" : "false") : String(value);
    await ipc.setSetting(key as string, str);
    set({ settings: { ...get().settings, [key]: value } });
  },
  async setPaused(p) {
    await ipc.setTrackingPaused(p);
    set({ settings: { ...get().settings, tracking_paused: p } });
  },
  async setPrivate(p) {
    await ipc.setPrivateMode(p);
    set({ settings: { ...get().settings, private_mode: p } });
  },
}));
