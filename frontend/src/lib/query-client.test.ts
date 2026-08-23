import { describe, it, expect, beforeEach } from "vitest";
import { createQueryClient, getSessionEpoch, resetQueryCache } from "./query-client";
import { qk } from "./query-keys";

describe("resetQueryCache", () => {
  beforeEach(() => {
    createQueryClient();
  });

  it("drops cached queries so the next session cannot reuse them", () => {
    const client = createQueryClient();
    client.setQueryData(["tickets"], [{ id: "old-user-ticket" }]);
    client.setQueryData(["notifications"], [{ id: "old-note" }]);

    resetQueryCache();

    expect(client.getQueryData(["tickets"])).toBeUndefined();
    expect(client.getQueryData(["notifications"])).toBeUndefined();
  });

  it("advances the session epoch so in-flight replies are rejected", () => {
    const before = getSessionEpoch();
    resetQueryCache();
    expect(getSessionEpoch()).toBe(before + 1);
  });
});

describe("report rollups", () => {
  it("go stale after any successful write, whichever hook made it", async () => {
    // Nothing owns the dashboard counters, so no write hook can be relied on to
    // remember them. The client refreshes them centrally instead.
    const client = createQueryClient();
    client.setQueryData(qk.reports.dashboard(), { open: 1 });
    client.setQueryData(qk.reports.overdue(), []);

    const mutation = client
      .getMutationCache()
      .build(client, { mutationFn: async () => "saved" });
    await mutation.execute(undefined);

    expect(client.getQueryState(qk.reports.dashboard())?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.reports.overdue())?.isInvalidated).toBe(true);
  });

  it("survive a failed write untouched", async () => {
    const client = createQueryClient();
    client.setQueryData(qk.reports.dashboard(), { open: 1 });

    const mutation = client.getMutationCache().build(client, {
      mutationFn: async () => { throw new Error("nope"); },
      retry: false,
    });
    await expect(mutation.execute(undefined)).rejects.toThrow("nope");

    expect(client.getQueryState(qk.reports.dashboard())?.isInvalidated).toBe(false);
  });
});
