"use client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { TESTING_LABELS } from "@/lib/constants";

/**
 * A suite write is never only a suite write.
 *
 * The list card carries the rollup, the workspace carries the cases, and a
 * ticket page carries the suites that cover it — so every write settles all
 * three rather than refreshing the one view the user happens to be looking at.
 */
export function settleSuiteWrite(qc: QueryClient, suiteId?: string) {
  qc.invalidateQueries({ queryKey: qk.suites.all });
  if (suiteId) qc.invalidateQueries({ queryKey: qk.suites.detail(suiteId) });
  // Linked tickets show the suite and its pass rate in their testing section.
  qc.invalidateQueries({ queryKey: qk.ticket.all });
}

/**
 * Force the suite workspace to show server truth — await the active queries.
 *
 * Mark sibling caches stale with `refetchType: "none"` first. A default
 * `invalidate` on `["suites"]` / `["cases"]` would kick parallel refetches of
 * the same detail keys we then `refetchQueries`, and the loser leaves the pane
 * stale until a hard refresh.
 *
 * Always `await` the targeted refetches. Fire-and-forget invalidate left the
 * rail / pane on optimistic or raced data until a hard refresh.
 */
export async function refreshTestingWorkspace(
  qc: QueryClient,
  opts: { suiteId?: string | null; caseId?: string | null; ticketId?: string | null } = {},
) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.bugs.all, refetchType: "none" }),
    qc.invalidateQueries({ queryKey: qk.suites.all, refetchType: "none" }),
    qc.invalidateQueries({ queryKey: qk.cases.all, refetchType: "none" }),
    qc.invalidateQueries({ queryKey: qk.ticket.all, refetchType: "none" }),
    qc.invalidateQueries({ queryKey: qk.tickets.all, refetchType: "none" }),
  ]);

  const tasks: Promise<unknown>[] = [
    qc.refetchQueries({ queryKey: qk.bugs.openCount() }),
    // Active bugs lists (and ticket testing panes) must refresh after a create —
    // marking stale alone left the page empty until a hard refresh.
    qc.refetchQueries({ queryKey: ["bugs", "list"] }),
  ];
  if (opts.suiteId) {
    tasks.push(qc.refetchQueries({ queryKey: qk.suites.detail(opts.suiteId) }));
  }
  if (opts.caseId) {
    // Prefix covers case detail and its steps sub-query.
    tasks.push(qc.refetchQueries({ queryKey: qk.cases.detail(opts.caseId) }));
  }
  if (opts.ticketId) {
    tasks.push(qc.refetchQueries({ queryKey: qk.ticket.testing(opts.ticketId) }));
    tasks.push(qc.refetchQueries({ queryKey: qk.ticket.detail(opts.ticketId) }));
  }
  await Promise.all(tasks);
}

export const failTesting = (e: { response?: { data?: { message?: string } } }) =>
  toast.error(e.response?.data?.message || "حدث خطأ");

export function useTestSuites(filters: Record<string, string> = {}) {
  return useQuery({
    queryKey: qk.suites.list(filters),
    queryFn: () => api.get("/test-suites", { params: filters }).then((r) => r.data),
  });
}

export function useTestSuite(id: string) {
  return useQuery({
    queryKey: qk.suites.detail(id),
    queryFn: () => api.get(`/test-suites/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useSuiteActions(suiteId?: string) {
  const qc = useQueryClient();
  const settled = { onSuccess: () => settleSuiteWrite(qc, suiteId), onError: failTesting };

  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        api.post("/test-suites", data).then((r) => r.data),
      onSuccess: () => settleSuiteWrite(qc),
      onError: failTesting,
    }),
    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.patch(`/test-suites/${id}`, data).then((r) => r.data),
      ...settled,
    }),
    publish: useMutation({
      mutationFn: (id: string) => api.post(`/test-suites/${id}/publish`).then((r) => r.data),
      onSuccess: async () => {
        await refreshTestingWorkspace(qc, { suiteId });
        toast.success(TESTING_LABELS.suitePublished);
      },
      onError: failTesting,
    }),
    archive: useMutation({
      mutationFn: (id: string) => api.post(`/test-suites/${id}/archive`).then((r) => r.data),
      onSuccess: async () => {
        await refreshTestingWorkspace(qc, { suiteId });
        toast.success(TESTING_LABELS.suiteArchivedToast);
      },
      onError: failTesting,
    }),
    unarchive: useMutation({
      mutationFn: (id: string) => api.post(`/test-suites/${id}/unarchive`).then((r) => r.data),
      onSuccess: async () => {
        await refreshTestingWorkspace(qc, { suiteId });
        toast.success(TESTING_LABELS.suiteUnarchivedToast);
      },
      onError: failTesting,
    }),
    linkTicket: useMutation({
      mutationFn: ({ id, ticketId }: { id: string; ticketId: string }) =>
        api.post(`/test-suites/${id}/tickets`, { ticketId }).then((r) => r.data),
      onSuccess: async (_data, vars) => {
        await refreshTestingWorkspace(qc, {
          suiteId: suiteId ?? vars.id,
          ticketId: vars.ticketId,
        });
        toast.success(TESTING_LABELS.suiteTicketsLinked);
      },
      onError: failTesting,
    }),
    unlinkTicket: useMutation({
      mutationFn: ({ id, ticketId }: { id: string; ticketId: string }) =>
        api.delete(`/test-suites/${id}/tickets/${ticketId}`).then((r) => r.data),
      onSuccess: async (_data, vars) => {
        qc.setQueryData(
          qk.suites.detail(vars.id),
          (
            old:
              | {
                  ticketLinks?: { ticketId: string }[];
                }
              | undefined,
          ) => {
            if (!old?.ticketLinks) return old;
            return {
              ...old,
              ticketLinks: old.ticketLinks.filter((l) => l.ticketId !== vars.ticketId),
            };
          },
        );
        await refreshTestingWorkspace(qc, {
          suiteId: suiteId ?? vars.id,
          ticketId: vars.ticketId,
        });
        toast.success(TESTING_LABELS.suiteTicketUnlinked);
      },
      onError: failTesting,
    }),
  };
}

/** Suites, cases and bugs for the «الاختبارات والأخطاء» section on a ticket. */
export function useTicketTesting(ticketId: string) {
  return useQuery({
    queryKey: qk.ticket.testing(ticketId),
    queryFn: () => api.get(`/tickets/${ticketId}/testing`).then((r) => r.data),
    enabled: !!ticketId,
  });
}
