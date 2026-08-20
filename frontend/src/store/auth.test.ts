import { describe, it, expect, beforeEach } from "vitest";
import { createQueryClient } from "@/lib/query-client";
import { useAuthStore, type AuthUser } from "./auth";

const userA: AuthUser = {
  id: "user-a",
  email: "a@barmijly.ai",
  firstName: "أحمد",
  lastName: "علي",
  role: "TICKET_REQUESTER",
};

const userB: AuthUser = {
  id: "user-b",
  email: "b@barmijly.ai",
  firstName: "سارة",
  lastName: "حسن",
  role: "DEVELOPER",
};

describe("auth session cache", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: null, user: null });
    createQueryClient();
  });

  it("clears cached lists on logout so the next user does not see them", () => {
    const client = createQueryClient();
    useAuthStore.getState().setAuth("token-a", userA);
    client.setQueryData(["tickets"], [{ id: "a-ticket" }]);

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(client.getQueryData(["tickets"])).toBeUndefined();
  });

  it("clears cached lists when a different user signs in", () => {
    const client = createQueryClient();
    useAuthStore.getState().setAuth("token-a", userA);
    client.setQueryData(["tickets"], [{ id: "a-ticket" }]);

    useAuthStore.getState().setAuth("token-b", userB);

    expect(useAuthStore.getState().user?.id).toBe("user-b");
    expect(client.getQueryData(["tickets"])).toBeUndefined();
  });
});
