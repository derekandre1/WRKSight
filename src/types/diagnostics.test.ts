import { describe, it, expect } from "vitest";
import { ipc } from "@/lib/tauri";

describe("get_diagnostics (mock backend)", () => {
  it("returns a populated snapshot from the seeded mock store", async () => {
    const d = await ipc.getDiagnostics();
    expect(typeof d.paused).toBe("boolean");
    expect(typeof d.private_mode).toBe("boolean");
    expect(typeof d.platform).toBe("string");
    expect(typeof d.db_path).toBe("string");
    // The mock seed has at least one raw event today.
    expect(d.raw_count_total).toBeGreaterThan(0);
    expect(d.last_raw_event).not.toBeNull();
  });
});
