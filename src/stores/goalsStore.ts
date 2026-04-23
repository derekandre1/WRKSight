import { create } from "zustand";
import { ipc } from "@/lib/tauri";
import type { Goal } from "@/types/goal";

interface GoalsState {
  goals: Goal[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (g: Goal) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const useGoals = create<GoalsState>((set, get) => ({
  goals: [],
  loaded: false,
  async load() {
    const goals = await ipc.listGoals();
    set({ goals, loaded: true });
  },
  async save(g) {
    const id = await ipc.upsertGoal(g);
    const saved = { ...g, id };
    const without = get().goals.filter((x) => x.id !== saved.id);
    set({ goals: [saved, ...without] });
  },
  async remove(id) {
    await ipc.deleteGoal(id);
    set({ goals: get().goals.filter((g) => g.id !== id) });
  },
}));
