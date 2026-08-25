import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TESTING_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
let currentRole = "QA";
let openBugs = 3;

vi.mock("@/lib/api", () => ({
  default: { get: (...args: unknown[]) => mockGet(...args), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/store/auth", () => ({
  useAuthStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      user: { id: "u1", firstName: "سارة", lastName: "أحمد", email: "qa@x.com", role: currentRole },
      logout: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/hooks/useTheme", () => ({ useTheme: () => ({ isDark: true, toggle: vi.fn() }) }));

import { Sidebar } from "./Sidebar";

/**
 * The badge adds a spoken phrase to the link's accessible name, so the entries
 * are matched by prefix rather than by an exact string that changes with the
 * count.
 */
const navLink = (label: string) => screen.getByRole("link", { name: new RegExp(label) });
const queryNavLink = (label: string) =>
  screen.queryByRole("link", { name: new RegExp(label) });

function renderSidebar(role = "QA") {
  currentRole = role;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Sidebar />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  openBugs = 3;
  // The two badges read different shapes: notifications answers with a bare
  // number, open-count with `{ count }`.
  mockGet.mockImplementation((url: string) =>
    Promise.resolve({ data: url === "/bugs/open-count" ? { count: openBugs } : 0 }),
  );
});

describe("Sidebar — the QA entries", () => {
  it.each(["QA", "PROGRAMMING_HEAD", "PROJECT_MANAGER", "DEVELOPER", "SYSTEM_OWNER", "SENIOR_MANAGEMENT"])(
    "shows both to %s",
    (role) => {
      renderSidebar(role);
      expect(navLink(TESTING_LABELS.suitesTitle)).toHaveAttribute("href", "/test-suites");
      expect(navLink(TESTING_LABELS.bugsTitle)).toHaveAttribute("href", "/bugs");
    },
  );

  it("hides both from TICKET_REQUESTER — no nav entry, as well as 403 on the URL", () => {
    renderSidebar("TICKET_REQUESTER");
    expect(queryNavLink(TESTING_LABELS.suitesTitle)).toBeNull();
    expect(queryNavLink(TESTING_LABELS.bugsTitle)).toBeNull();
  });
});

describe("Sidebar — the open-bug badge", () => {
  it("counts open bugs on the /bugs entry", async () => {
    renderSidebar();
    await waitFor(() => expect(navLink(TESTING_LABELS.bugsTitle)).toHaveTextContent("3"));
  });

  it("says what the count means, rather than reading digits at a screen reader", async () => {
    renderSidebar();
    await waitFor(() =>
      expect(navLink(TESTING_LABELS.bugsTitle)).toHaveAccessibleName(
        new RegExp(`3 ${TESTING_LABELS.openBugs}`),
      ),
    );
  });

  it("shows nothing at zero rather than a 0 bubble", async () => {
    openBugs = 0;
    renderSidebar();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(navLink(TESTING_LABELS.bugsTitle)).not.toHaveTextContent("0");
  });

  it("caps the bubble at 99+", async () => {
    openBugs = 250;
    renderSidebar();
    await waitFor(() => expect(navLink(TESTING_LABELS.bugsTitle)).toHaveTextContent("99+"));
  });

  it("never asks for the count when the user has no QA surface", () => {
    renderSidebar("TICKET_REQUESTER");
    expect(mockGet).not.toHaveBeenCalledWith("/bugs/open-count");
  });
});
