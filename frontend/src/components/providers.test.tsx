import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Providers } from "./providers";
import { useAuthStore, type AuthUser } from "@/store/auth";

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

function CacheProbe() {
  const qc = useQueryClient();
  const [, force] = useReducer((n: number) => n + 1, 0);
  const tickets = qc.getQueryData<{ id: string }[]>(["tickets"]);
  return (
    <div>
      <span data-testid="cache">{tickets?.[0]?.id ?? "empty"}</span>
      <button
        type="button"
        onClick={() => {
          qc.setQueryData(["tickets"], [{ id: "user-a-ticket" }]);
          force();
        }}
      >
        seed
      </button>
    </div>
  );
}

describe("Providers session cache", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: null, user: null });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  it("gives the next user an empty cache after logout", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ token: "token-a", user: userA });
    render(
      <Providers>
        <CacheProbe />
      </Providers>,
    );

    await user.click(screen.getByRole("button", { name: "seed" }));
    expect(screen.getByTestId("cache")).toHaveTextContent("user-a-ticket");

    act(() => {
      useAuthStore.getState().logout();
    });
    expect(screen.getByTestId("cache")).toHaveTextContent("empty");

    act(() => {
      useAuthStore.getState().setAuth("token-b", userB);
    });
    expect(screen.getByTestId("cache")).toHaveTextContent("empty");
  });
});
