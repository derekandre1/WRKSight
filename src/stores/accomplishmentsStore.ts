import { create } from "zustand";
import { ipc } from "@/lib/tauri";
import type { Accomplishment } from "@/types/accomplishment";

interface AccState {
  accomplishments: Accomplishment[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (a: Accomplishment) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const useAccomplishments = create<AccState>((set, get) => ({
  accomplishments: [],
  loaded: false,
  async load() {
    const rows = await ipc.listAccomplishments();
    set({ accomplishments: rows, loaded: true });
  },
  async save(a) {
    const id = await ipc.upsertAccomplishment(a);
    const saved = { ...a, id };
    const without = get().accomplishments.filter((x) => x.id !== saved.id);
    set({ accomplishments: [saved, ...without] });
  },
  async remove(id) {
    await ipc.deleteAccomplishment(id);
    set({ accomplishments: get().accomplishments.filter((a) => a.id !== id) });
  },
}));
