import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTaskActions, useUpdateTaskStatus } from "./useTasks";
import { qk } from "@/lib/query-keys";

const mockPatch = vi.fn();
const mockPost = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TICKET = "ticket-1";

/** Every view a task write can be read through, seeded so it can go stale. */
const touchedKeys = [
  qk.tasks.mine(),
  qk.ticket.tasks(TICKET),
  qk.ticket.detail(TICKET),
  qk.ticket.assignees(TICKET),
  qk.ticket.timeline(TICKET),
  qk.tickets.list({}),
];

function seededClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const key of touchedKeys) client.setQueryData(key, []);
  return client;
}

function wrapperFor(client: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("task writes", () => {
  beforeEach(() => {
    mockPatch.mockReset();
    mockPost.mockReset();
  });

  it("refresh the ticket as well as the task list", async () => {
    mockPost.mockResolvedValue({ data: { id: "task-1" } });
    const client = seededClient();
    const { result } = renderHook(() => useTaskActions(TICKET), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.create.mutateAsync({ title: "مهمة" });
    });

    for (const key of touchedKeys) {
      expect({ key, stale: client.getQueryState(key)?.isInvalidated }).toEqual({ key, stale: true });
    }
  });

  it("moving a task from the hub leaves the ticket page stale, not showing the old count", async () => {
    // The open-task count on the ticket gates «إرسال للاختبار». Ticking a task
    // off on the dashboard has to reach it, and the hub does not know which
    // ticket the task belongs to.
    mockPatch.mockResolvedValue({ data: { id: "task-1", status: "COMPLETED" } });
    const client = seededClient();
    const { result } = renderHook(() => useUpdateTaskStatus(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.mutateAsync({ id: "task-1", status: "COMPLETED" });
    });

    expect(client.getQueryState(qk.ticket.detail(TICKET))?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.ticket.tasks(TICKET))?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.tickets.list({}))?.isInvalidated).toBe(true);
  });
});
