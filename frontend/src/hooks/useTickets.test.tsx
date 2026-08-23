import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { keepNewerTicket, mergeTicketCache, useTicket, useTicketAction } from "./useTickets";
import { qk } from "@/lib/query-keys";

const mockGet = vi.fn();
const mockPatch = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const cached = {
  id: "ticket-1",
  title: "تعديل قالب الفاتورة",
  status: "APPROVED",
  updatedAt: "2026-08-20T18:00:00.000Z",
  comments: [{ id: "c1" }],
};

describe("mergeTicketCache", () => {
  it("keeps relations while applying the new status", () => {
    const merged = mergeTicketCache(cached, {
      status: "IN_PROGRESS",
      updatedAt: "2026-08-20T18:01:00.000Z",
    }) as typeof cached;

    expect(merged.status).toBe("IN_PROGRESS");
    expect(merged.comments).toEqual([{ id: "c1" }]);
    expect(merged.title).toBe("تعديل قالب الفاتورة");
  });
});

describe("keepNewerTicket", () => {
  it("ignores a slower GET that still has the previous status", () => {
    const kept = keepNewerTicket(
      { ...cached, status: "IN_PROGRESS", updatedAt: "2026-08-20T18:01:00.000Z" },
      cached,
    ) as typeof cached;

    expect(kept.status).toBe("IN_PROGRESS");
    expect(kept.comments).toEqual([{ id: "c1" }]);
  });

  it("keeps plan fields from the cache when a stale GET is older", () => {
    const kept = keepNewerTicket(
      { ...cached, estimatedHours: 10, updatedAt: "2026-08-20T18:01:00.000Z" },
      { ...cached, estimatedHours: 50, updatedAt: "2026-08-20T18:00:00.000Z" },
    ) as typeof cached & { estimatedHours: number };

    expect(kept.estimatedHours).toBe(10);
  });

  it("uses the fetch when it is at least as new as the cache", () => {
    const fetched = { ...cached, status: "SCHEDULED", updatedAt: "2026-08-20T18:02:00.000Z", comments: [] };
    expect(keepNewerTicket(cached, fetched)).toBe(fetched);
  });

  it("defends the status but still takes relations from the fetch", () => {
    const kept = keepNewerTicket(
      { ...cached, status: "IN_PROGRESS", updatedAt: "2026-08-20T18:05:00.000Z" },
      { ...cached, comments: [{ id: "c1" }, { id: "c2" }], statusHistory: [{ id: "h1" }] },
    ) as typeof cached & { statusHistory: unknown[] };

    expect(kept.status).toBe("IN_PROGRESS");
    // The cached copy of a relation is never newer than the one just fetched —
    // keeping it froze the comment thread and the activity log on screen.
    expect(kept.comments).toHaveLength(2);
    expect(kept.statusHistory).toEqual([{ id: "h1" }]);
  });
});

describe("useTicketAction", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPatch.mockReset();
  });

  it("shows the new status even if the following GET is still stale", async () => {
    mockPatch.mockResolvedValue({
      data: { ...cached, status: "IN_PROGRESS", updatedAt: "2026-08-20T18:01:00.000Z" },
    });
    mockGet.mockResolvedValue({ data: cached });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    client.setQueryData(["ticket", "ticket-1"], cached);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => {
        const ticket = useTicket("ticket-1");
        const actions = useTicketAction("ticket-1");
        return { ticket, actions };
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.ticket.data?.status).toBe("APPROVED");
    });

    await act(async () => {
      await result.current.actions.forceStatus.mutateAsync({ status: "IN_PROGRESS" });
    });

    await waitFor(() => {
      expect(result.current.ticket.data?.status).toBe("IN_PROGRESS");
    });
  });

  it('keeps plan fields after updatePlan without refetching the ticket', async () => {
    mockPatch.mockResolvedValue({
      data: { ...cached, estimatedHours: 605, updatedAt: "2026-08-20T18:01:00.000Z" },
    });
    mockGet.mockResolvedValue({ data: { ...cached, estimatedHours: 50 } });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    client.setQueryData(["ticket", "ticket-1"], cached);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => {
        const ticket = useTicket("ticket-1");
        const actions = useTicketAction("ticket-1");
        return { ticket, actions };
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.ticket.data?.status).toBe("APPROVED");
    });

    const getCallsBefore = mockGet.mock.calls.length;

    await act(async () => {
      await result.current.actions.updatePlan.mutateAsync({ estimatedHours: 605 });
    });

    await waitFor(() => {
      expect(result.current.ticket.data?.estimatedHours).toBe(605);
    });
    expect(mockGet.mock.calls.length).toBe(getCallsBefore);
  });
});

describe("useTicketAction cache reach", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPatch.mockReset();
  });

  const renderTicket = (client: QueryClient) => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(
      () => ({ ticket: useTicket("ticket-1"), actions: useTicketAction("ticket-1") }),
      { wrapper },
    );
  };

  const freshClient = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    client.setQueryData(qk.ticket.detail("ticket-1"), cached);
    return client;
  };

  it("drops every view built from the ticket, not just the one on screen", async () => {
    mockPatch.mockResolvedValue({
      data: { ...cached, status: "IN_PROGRESS", updatedAt: "2026-08-20T18:01:00.000Z" },
    });
    mockGet.mockResolvedValue({ data: { ...cached, status: "IN_PROGRESS", updatedAt: "2026-08-20T18:01:00.000Z" } });

    const client = freshClient();
    const derived = [
      qk.tickets.list({}),
      qk.tickets.myCreated(),
      qk.tickets.byCompany("company-1"),
      qk.tickets.byUser("user-1", true),
      qk.tickets.devBase(),
      qk.ticket.timeline("ticket-1"),
      qk.ticket.assignees("ticket-1"),
      qk.ticket.dependencies("ticket-1"),
      qk.ticket.tasks("ticket-1"),
      qk.tasks.mine(),
    ];
    for (const key of derived) client.setQueryData(key, []);

    const { result } = renderTicket(client);
    await act(async () => {
      await result.current.actions.startWork.mutateAsync(undefined);
    });

    for (const key of derived) {
      expect({ key, stale: client.getQueryState(key)?.isInvalidated }).toEqual({ key, stale: true });
    }
  });

  it("stamps an optimistic plan save one tick past the cache, never the browser clock", async () => {
    // A browser running ahead of the API server used to stamp a future time, and
    // every later GET then looked stale — the ticket stopped updating for good.
    let settlePatch: (value: unknown) => void = () => {};
    mockPatch.mockImplementation(() => new Promise((resolve) => { settlePatch = resolve; }));
    mockGet.mockResolvedValue({ data: cached });

    const client = freshClient();
    const { result } = renderTicket(client);
    await waitFor(() => expect(result.current.ticket.data?.status).toBe("APPROVED"));

    act(() => {
      result.current.actions.updatePlan.mutate({ estimatedHours: 7 });
    });

    await waitFor(() => {
      expect(result.current.ticket.data?.estimatedHours).toBe(7);
    });
    expect(result.current.ticket.data?.updatedAt).toBe("2026-08-20T18:00:00.001Z");

    await act(async () => {
      settlePatch({ data: { ...cached, estimatedHours: 7, updatedAt: "2026-08-20T18:01:00.000Z" } });
    });
  });
});
