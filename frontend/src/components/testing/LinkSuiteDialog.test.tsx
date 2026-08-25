import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkSuiteDialog } from "./LinkSuiteDialog";
import { TESTING_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const suites = [
  { id: "suite-1", suiteNumber: 7, title: "مجموعة تسجيل الدخول", state: "ACTIVE" },
  { id: "suite-2", suiteNumber: 8, title: "مجموعة الفواتير", state: "DRAFT" },
];

function renderDialog(props: Partial<Parameters<typeof LinkSuiteDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LinkSuiteDialog ticketId="ticket-1" systemId="system-1" onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({
    data: { data: suites, total: 2, page: 1, limit: 50, totalPages: 1 },
  });
  mockPost.mockResolvedValue({ data: {} });
});

describe("LinkSuiteDialog", () => {
  it("only offers suites in the ticket's own system", async () => {
    renderDialog();
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/test-suites", {
        params: { systemId: "system-1", limit: "50" },
      }),
    );
  });

  it("links the picked suite to the ticket", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole("button", { name: /مجموعة تسجيل الدخول/ }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/test-suites/suite-1/tickets", {
        ticketId: "ticket-1",
      }),
    );
  });

  it("closes once the link lands", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onClose });

    await user.click(await screen.findByRole("button", { name: /مجموعة الفواتير/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows an already-linked suite as linked rather than hiding it", async () => {
    renderDialog({ linkedSuiteIds: ["suite-1"] });

    const row = await screen.findByRole("button", { name: /مجموعة تسجيل الدخول/ });
    expect(row).toBeDisabled();
    expect(screen.getByText(TESTING_LABELS.alreadyLinked)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /مجموعة الفواتير/ })).toBeEnabled();
  });

  it("filters the list as it is typed into", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("button", { name: /مجموعة تسجيل الدخول/ });

    await user.type(screen.getByLabelText(TESTING_LABELS.searchSuites), "الفواتير");

    expect(screen.queryByRole("button", { name: /مجموعة تسجيل الدخول/ })).toBeNull();
    expect(screen.getByRole("button", { name: /مجموعة الفواتير/ })).toBeInTheDocument();
  });

  it("says the system has no suites rather than showing a blank panel", async () => {
    mockGet.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 50, totalPages: 0 } });
    renderDialog();
    expect(await screen.findByText(TESTING_LABELS.noSuitesInSystem)).toBeInTheDocument();
  });

  it("is a labelled modal", async () => {
    renderDialog();
    expect(await screen.findByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });
});
