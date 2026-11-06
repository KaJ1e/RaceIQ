import { describe, expect, test, beforeEach } from "bun:test";
import { onlineHealth, recordOnlineFailure, recordOnlineSuccess, resetOnlineHealth } from "@raceiq/backend-core/runtime/network-health";

describe("online health", () => {
  beforeEach(() => resetOnlineHealth());

  test("stays unknown until a source reports", () => {
    const health = onlineHealth();
    expect(health.known).toBe(false);
    expect(health.reachable).toBe(true);
  });

  test("a failed source makes the aggregate unreachable and keeps detail", () => {
    recordOnlineSuccess("update");
    recordOnlineFailure("tunes", "The operation timed out.");
    const health = onlineHealth();
    expect(health.known).toBe(true);
    expect(health.reachable).toBe(false);
    const tunes = health.sources.find((entry) => entry.source === "tunes");
    expect(tunes?.ok).toBe(false);
    expect(tunes?.detail).toContain("timed out");
  });

  test("a later success clears the failure for that source", () => {
    recordOnlineFailure("laptimes", "ECONNRESET");
    recordOnlineSuccess("laptimes");
    expect(onlineHealth().reachable).toBe(true);
  });
});
