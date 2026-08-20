import { describe, it, expect, beforeEach } from "vitest";
import { createQueryClient, getSessionEpoch, resetQueryCache } from "./query-client";

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
