import { create } from "zustand";
import { ipc } from "@/lib/tauri";
import type { Exclusion, ExclusionKind } from "@/types/exclusion";

interface ExclusionsState {
  exclusions: Exclusion[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (kind: ExclusionKind, value: string, note?: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const useExclusions = create<ExclusionsState>((set, get) => ({
  exclusions: [],
  loaded: false,
  async load() {
    const rows = await ipc.listExclusions();
    set({ exclusions: rows, loaded: true });
  },
  async add(kind, value, note) {
    const id = await ipc.addExclusion(kind, value, note);
    set({ exclusions: [...get().exclusions, { id, kind, value, note: note ?? null }] });
  },
  async remove(id) {
    await ipc.removeExclusion(id);
    set({ exclusions: get().exclusions.filter((e) => e.id !== id) });
  },
}));
