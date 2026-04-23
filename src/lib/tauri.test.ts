import { describe, it, expect, beforeEach } from "vitest";
import { ipc, __resetMockStore } from "./tauri";

describe("ipc mock backend", () => {
  beforeEach(() => {
    __resetMockStore();
  });

  it("exposes default settings on first call", async () => {
    const pairs = await ipc.getSettings();
    const map = Object.fromEntries(pairs);
    expect(map.tracking_paused).toBe("true");
    expect(map.ai_provider).toBe("mock");
  });

  it("persists a setting across calls", async () => {
    await ipc.setSetting("capture_interval_ms", "3000");
    const pairs = await ipc.getSettings();
    expect(Object.fromEntries(pairs).capture_interval_ms).toBe("3000");
  });

  it("adds and removes exclusions without duplicates", async () => {
    await ipc.addExclusion("app", "1Password");
    await ipc.addExclusion("app", "1Password");
    const list = await ipc.listExclusions();
    expect(list.filter((e) => e.value === "1Password")).toHaveLength(1);
    await ipc.removeExclusion(list[0].id!);
    const after = await ipc.listExclusions();
    expect(after.find((e) => e.value === "1Password")).toBeUndefined();
  });

  it("round-trips goal upsert + delete", async () => {
    const id = await ipc.upsertGoal({
      id: null,
      label: "Test",
      direction: "increase",
      target_kind: "strategic",
      target_value: null,
      target_hours: 10,
      active: true,
      created_at: 0,
    });
    expect(id).toBeGreaterThan(0);
    const goals = await ipc.listGoals();
    expect(goals.find((g) => g.id === id)).toBeTruthy();
    await ipc.deleteGoal(id);
    const after = await ipc.listGoals();
    expect(after.find((g) => g.id === id)).toBeUndefined();
  });
});
