import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useTestSuites, useSuiteActions, useTicketTesting } from "./useTestSuites";
import { useSuiteCases, useCaseActions, useStepActions } from "./useTestCases";
import { useBugs, useBugActions, useOpenBugCount } from "./useBugs";
import { qk } from "@/lib/query-keys";

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockGet.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20, totalPages: 0 } });
  mockPost.mockResolvedValue({ data: { id: "new" } });
  mockPatch.mockResolvedValue({ data: {} });
  mockDelete.mockResolvedValue({ data: {} });
});

describe("useTestSuites", () => {
  it("caches under the filters it was asked with, so two filters are two entries", async () => {
    const { result } = renderHook(() => useTestSuites({ health: "failing" }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(client.getQueryData(qk.suites.list({ health: "failing" }))).toBeDefined();
    expect(client.getQueryData(qk.suites.list({}))).toBeUndefined();
  });

  it("passes the filters through as query params", async () => {
    const { result } = renderHook(() => useTestSuites({ mine: "true" }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGet).toHaveBeenCalledWith("/test-suites", { params: { mine: "true" } });
  });

  it("returns the pagination envelope untouched", async () => {
    mockGet.mockResolvedValue({
      data: { data: [{ id: "s1" }], total: 3, page: 2, limit: 1, totalPages: 3 },
    });
    const { result } = renderHook(() => useTestSuites(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toMatchObject({ total: 3, page: 2, limit: 1, totalPages: 3 });
  });
});

describe("useSuiteActions", () => {
  it("refreshes the suites list and the tickets that link them after a publish", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const refetch = vi.spyOn(client, "refetchQueries");
    const { result } = renderHook(() => useSuiteActions("suite-1"), { wrapper });

    await act(async () => {
      await result.current.publish.mutateAsync("suite-1");
    });

    const invalidated = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    const refetched = refetch.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(invalidated).toContain(JSON.stringify(qk.suites.all));
    expect(invalidated).toContain(JSON.stringify(qk.ticket.all));
    expect(refetched).toContain(JSON.stringify(qk.suites.detail("suite-1")));
  });

  it("unlinks a ticket through the nested route", async () => {
    const { result } = renderHook(() => useSuiteActions("suite-1"), { wrapper });

    await act(async () => {
      await result.current.unlinkTicket.mutateAsync({ id: "suite-1", ticketId: "ticket-1" });
    });

    expect(mockDelete).toHaveBeenCalledWith("/test-suites/suite-1/tickets/ticket-1");
  });

  it("refetches the ticket testing section after linking a suite", async () => {
    client.setQueryData(qk.ticket.testing("ticket-1"), { suites: [], cases: [], bugs: [] });
    const refetch = vi.spyOn(client, "refetchQueries");
    const { result } = renderHook(() => useSuiteActions(), { wrapper });

    await act(async () => {
      await result.current.linkTicket.mutateAsync({ id: "suite-1", ticketId: "ticket-1" });
    });

    expect(refetch).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: qk.ticket.testing("ticket-1") }),
    );
  });
});

describe("useTicketTesting", () => {
  it("hangs off the ticket's own key, so a ticket refresh takes it along", async () => {
    const { result } = renderHook(() => useTicketTesting("ticket-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(qk.ticket.testing("ticket-1")).toEqual(["ticket", "ticket-1", "testing"]);
    expect(client.getQueryData(qk.ticket.testing("ticket-1"))).toBeDefined();
  });

  it("asks for nothing without a ticket id", () => {
    renderHook(() => useTicketTesting(""), { wrapper });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("useSuiteCases", () => {
  it("caches under the suite, so publishing a case refreshes the workspace", async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useSuiteCases("suite-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(qk.cases.bySuite("suite-1")[0]).toBe("suites");
    expect(mockGet).toHaveBeenCalledWith("/test-suites/suite-1/cases");
  });
});

describe("useCaseActions", () => {
  it("records a result on the case's own route", async () => {
    const { result } = renderHook(() => useCaseActions("suite-1", "case-1"), { wrapper });

    await act(async () => {
      await result.current.recordResult.mutateAsync({ id: "case-1", result: "FAIL" });
    });

    expect(mockPost).toHaveBeenCalledWith("/test-cases/case-1/result", { result: "FAIL" });
  });

  it("settles the suite rollup too — a result moves the pass rate", async () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCaseActions("suite-1", "case-1"), { wrapper });

    await act(async () => {
      await result.current.recordResult.mutateAsync({ id: "case-1", result: "PASS" });
    });

    const keys = spy.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(keys).toContain(JSON.stringify(qk.suites.all));
    expect(keys).toContain(JSON.stringify(qk.bugs.all));
  });
});

describe("useStepActions", () => {
  it("appends to a case through the case route", async () => {
    const { result } = renderHook(() => useStepActions({ caseId: "case-1" }), { wrapper });

    await act(async () => {
      await result.current.add.mutateAsync("افتح الصفحة");
    });

    expect(mockPost).toHaveBeenCalledWith("/test-cases/case-1/steps", { body: "افتح الصفحة" });
  });

  it("appends to a bug through the bug route", async () => {
    const { result } = renderHook(() => useStepActions({ bugId: "bug-1" }), { wrapper });

    await act(async () => {
      await result.current.add.mutateAsync("افتح الصفحة");
    });

    expect(mockPost).toHaveBeenCalledWith("/bugs/bug-1/steps", { body: "افتح الصفحة" });
  });

  it("edits, reorders and deletes through the one shared step route", async () => {
    const { result } = renderHook(() => useStepActions({ bugId: "bug-1" }), { wrapper });

    await act(async () => {
      await result.current.update.mutateAsync({ id: "s1", body: "نص" });
      await result.current.reorder.mutateAsync({ id: "s1", order: 2 });
      await result.current.remove.mutateAsync("s1");
    });

    expect(mockPatch).toHaveBeenCalledWith("/test-steps/s1", { body: "نص" });
    expect(mockPost).toHaveBeenCalledWith("/test-steps/s1/reorder", { order: 2 });
    expect(mockDelete).toHaveBeenCalledWith("/test-steps/s1");
  });

  it("exposes a refresh, because an upload does not touch a step route", async () => {
    const refetch = vi.spyOn(client, "refetchQueries");
    const { result } = renderHook(() => useStepActions({ caseId: "case-1" }), { wrapper });

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      const keys = refetch.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
      expect(keys).toContain(JSON.stringify(qk.cases.steps("case-1")));
    });
  });
});

describe("useBugs", () => {
  it("passes the filters through and keeps them in the key", async () => {
    const { result } = renderHook(() => useBugs({ hasTicket: "false" }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGet).toHaveBeenCalledWith("/bugs", { params: { hasTicket: "false" } });
    expect(client.getQueryData(qk.bugs.list({ hasTicket: "false" }))).toBeDefined();
  });
});

describe("useOpenBugCount", () => {
  it("unwraps the count the badge renders", async () => {
    mockGet.mockResolvedValue({ data: { count: 4 } });
    const { result } = renderHook(() => useOpenBugCount(), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(4));
  });

  it("asks for nothing when the caller has no QA surface", () => {
    renderHook(() => useOpenBugCount(false), { wrapper });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("useBugActions", () => {
  it("promotes through the bug's own route", async () => {
    const { result } = renderHook(() => useBugActions("bug-1"), { wrapper });

    await act(async () => {
      await result.current.promote.mutateAsync({ id: "bug-1", title: "(BUG-0001) عنوان" });
    });

    expect(mockPost).toHaveBeenCalledWith("/bugs/bug-1/promote", {
      title: "(BUG-0001) عنوان",
    });
  });

  it("refreshes the suites and the tickets after a promote, not only the bug list", async () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useBugActions("bug-1"), { wrapper });

    await act(async () => {
      await result.current.promote.mutateAsync({ id: "bug-1" });
    });

    const keys = spy.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(keys).toContain(JSON.stringify(qk.bugs.all));
    expect(keys).toContain(JSON.stringify(qk.suites.all));
    expect(keys).toContain(JSON.stringify(qk.ticket.all));
  });

  it("prepends a linked bug into the case detail cache immediately", async () => {
    client.setQueryData(qk.cases.detail("case-1"), {
      id: "case-1",
      bugs: [],
      _count: { bugs: 0 },
    });
    mockPatch.mockResolvedValue({
      data: {
        id: "bug-9",
        title: "FF",
        severity: "MAJOR",
        status: "IN_PROGRESS",
        testCaseId: "case-1",
        suiteId: "suite-1",
      },
    });
    mockGet.mockResolvedValue({
      data: {
        id: "case-1",
        bugs: [
          {
            id: "bug-9",
            title: "FF",
            severity: "MAJOR",
            status: "IN_PROGRESS",
          },
        ],
        _count: { bugs: 1 },
      },
    });

    const { result } = renderHook(() => useBugActions(undefined, "case-1"), { wrapper });

    await act(async () => {
      await result.current.update.mutateAsync({ id: "bug-9", testCaseId: "case-1" });
    });

    const cached = client.getQueryData(qk.cases.detail("case-1")) as {
      bugs: { id: string }[];
    };
    expect(cached.bugs.some((b) => b.id === "bug-9")).toBe(true);
  });
});

describe("useCaseActions cache", () => {
  it("does not let a case field save wipe a concurrently linked bug", async () => {
    client.setQueryData(qk.cases.detail("case-1"), {
      id: "case-1",
      title: "قديم",
      bugs: [{ id: "bug-linked", title: "FF", severity: "MAJOR", status: "OPEN" }],
      _count: { bugs: 1 },
    });
    mockPatch.mockResolvedValue({
      data: {
        id: "case-1",
        title: "جديد",
        bugs: [],
        _count: { bugs: 0, steps: 2 },
      },
    });

    const { result } = renderHook(() => useCaseActions("suite-1", "case-1"), { wrapper });

    await act(async () => {
      await result.current.update.mutateAsync({ id: "case-1", title: "جديد" });
    });

    const cached = client.getQueryData(qk.cases.detail("case-1")) as {
      title: string;
      bugs: { id: string }[];
      _count: { bugs: number; steps: number };
    };
    expect(cached.title).toBe("جديد");
    expect(cached.bugs.map((b) => b.id)).toEqual(["bug-linked"]);
    expect(cached._count.bugs).toBe(1);
  });

  it("does not let a late field save wipe a recorded result on the case or suite rail", async () => {
    client.setQueryData(qk.cases.detail("case-1"), {
      id: "case-1",
      title: "حالة",
      lastResult: "FAIL",
      bugs: [{ id: "bug-1", title: "خطأ", severity: "MAJOR", status: "OPEN" }],
      _count: { bugs: 1 },
    });
    client.setQueryData(qk.suites.detail("suite-1"), {
      id: "suite-1",
      cases: [
        {
          id: "case-1",
          title: "حالة",
          lastResult: "FAIL",
          _count: { bugs: 1 },
          bugs: [{ status: "OPEN" }],
        },
      ],
    });
    mockPatch.mockResolvedValue({
      data: {
        id: "case-1",
        title: "حالة محدثة",
        lastResult: "NOT_RUN",
        bugs: [],
        _count: { bugs: 0 },
      },
    });

    const { result } = renderHook(() => useCaseActions("suite-1", "case-1"), { wrapper });

    await act(async () => {
      await result.current.update.mutateAsync({ id: "case-1", title: "حالة محدثة" });
    });

    const detail = client.getQueryData(qk.cases.detail("case-1")) as {
      title: string;
      lastResult: string;
      bugs: { id: string }[];
      _count: { bugs: number };
    };
    expect(detail.title).toBe("حالة محدثة");
    expect(detail.lastResult).toBe("FAIL");
    expect(detail.bugs.map((b) => b.id)).toEqual(["bug-1"]);
    expect(detail._count.bugs).toBe(1);

    const suite = client.getQueryData(qk.suites.detail("suite-1")) as {
      cases: { id: string; lastResult: string; _count: { bugs: number } }[];
    };
    expect(suite.cases[0].lastResult).toBe("FAIL");
    expect(suite.cases[0]._count.bugs).toBe(1);
  });

  it("patches only lastResult onto the suite rail when recording a result", async () => {
    const suiteRow = {
      id: "case-1",
      title: "حالة",
      lastResult: "NOT_RUN",
      _count: { bugs: 2 },
      bugs: [{ status: "OPEN" }, { status: "OPEN" }],
    };
    client.setQueryData(qk.suites.detail("suite-1"), {
      id: "suite-1",
      cases: [suiteRow],
      rollup: { pass: 0, fail: 0, blocked: 0, skipped: 0, notRun: 1, total: 1 },
    });
    client.setQueryData(qk.cases.detail("case-1"), {
      id: "case-1",
      title: "حالة",
      lastResult: "NOT_RUN",
      bugs: [
        { id: "b1", status: "OPEN" },
        { id: "b2", status: "OPEN" },
      ],
      _count: { bugs: 2 },
    });
    mockPost.mockResolvedValue({
      data: {
        id: "case-1",
        lastResult: "FAIL",
        lastRunAt: "2026-01-01T00:00:00.000Z",
        lastRunBy: { id: "u1", firstName: "أ", lastName: "ب" },
        bugs: [],
        _count: { bugs: 0 },
      },
    });
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes("/test-suites/")) {
        return Promise.resolve({
          data: {
            id: "suite-1",
            cases: [{ ...suiteRow, lastResult: "FAIL" }],
            rollup: { pass: 0, fail: 1, blocked: 0, skipped: 0, notRun: 0, total: 1 },
          },
        });
      }
      return Promise.resolve({
        data: {
          id: "case-1",
          lastResult: "FAIL",
          bugs: [
            { id: "b1", status: "OPEN" },
            { id: "b2", status: "OPEN" },
          ],
          _count: { bugs: 2 },
        },
      });
    });

    const { result } = renderHook(() => useCaseActions("suite-1", "case-1"), { wrapper });

    await act(async () => {
      await result.current.recordResult.mutateAsync({ id: "case-1", result: "FAIL" });
    });

    const suite = client.getQueryData(qk.suites.detail("suite-1")) as {
      cases: { lastResult: string; _count: { bugs: number }; bugs: unknown[] }[];
    };
    expect(suite.cases[0].lastResult).toBe("FAIL");
    expect(suite.cases[0]._count.bugs).toBe(2);

    const detail = client.getQueryData(qk.cases.detail("case-1")) as {
      lastResult: string;
      bugs: { id: string }[];
    };
    expect(detail.lastResult).toBe("FAIL");
    expect(detail.bugs.map((b) => b.id)).toEqual(["b1", "b2"]);
  });
});
