"use client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { failTesting, refreshTestingWorkspace } from "@/hooks/useTestSuites";
import { TESTING_LABELS } from "@/lib/constants";

/**
 * A bug write moves more than the bug list: an open bug tints its suite's
 * health spine, and promoting one creates a ticket that has to appear in the
 * tickets list straight away. Always await the workspace refetch — invalidate
 * alone races case autosaves and leaves the pane stale until a hard refresh.
 */
async function settleBugWrite(
  qc: QueryClient,
  opts: {
    bugId?: string;
    caseId?: string | null;
    suiteId?: string | null;
    ticketId?: string | null;
  } = {},
) {
  await refreshTestingWorkspace(qc, {
    suiteId: opts.suiteId,
    caseId: opts.caseId,
  });
  if (opts.bugId) {
    await qc.refetchQueries({ queryKey: qk.bugs.detail(opts.bugId) });
  }
  if (opts.ticketId) {
    await qc.refetchQueries({ queryKey: qk.ticket.testing(opts.ticketId) });
  }
}

type CaseBugsCache = {
  bugs?: { id: string }[];
  _count?: { bugs?: number };
};

/** Shape returned by POST/PATCH /bugs — used for mutateAsync typing. */
type BugWriteResult = {
  id: string;
  title?: string;
  bugNumber?: number | null;
  severity?: string;
  status?: string;
  description?: string | null;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  environment?: string | null;
  priority?: string | null;
  testCaseId?: string | null;
  suiteId?: string | null;
  ticketId?: string | null;
  ticket?: unknown;
  testCase?: unknown;
};

function removeCaseBug(qc: QueryClient, caseId: string, bugId: string) {
  qc.setQueryData(qk.cases.detail(caseId), (old: CaseBugsCache | undefined) => {
    if (!old?.bugs) return old;
    const bugs = old.bugs.filter((b) => b.id !== bugId);
    return {
      ...old,
      bugs,
      _count: old._count
        ? { ...old._count, bugs: Math.max(0, (old._count.bugs ?? old.bugs.length) - 1) }
        : old._count,
    };
  });
}

/** Suite panel shows `_count.bugs` per case — bump it when linking without a full suite refetch. */
function bumpSuiteCaseBugCount(
  qc: QueryClient,
  suiteId: string,
  caseId: string,
  delta: number,
) {
  qc.setQueryData(
    qk.suites.detail(suiteId),
    (
      old:
        | {
            cases?: { id: string; _count?: { bugs?: number } }[];
          }
        | undefined,
    ) => {
      if (!old?.cases) return old;
      return {
        ...old,
        cases: old.cases.map((c) =>
          c.id !== caseId
            ? c
            : {
                ...c,
                _count: {
                  ...c._count,
                  bugs: Math.max(0, (c._count?.bugs ?? 0) + delta),
                },
              },
        ),
      };
    },
  );
}

export function useBugs(filters: Record<string, string> = {}) {
  return useQuery({
    queryKey: qk.bugs.list(filters),
    queryFn: () => api.get("/bugs", { params: filters }).then((r) => r.data),
  });
}

export function useBug(id: string) {
  return useQuery({
    queryKey: qk.bugs.detail(id),
    queryFn: () => api.get(`/bugs/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

/** Open-bug badge on the sidebar. Same scope as the list it links to. */
export function useOpenBugCount(enabled = true) {
  return useQuery({
    queryKey: qk.bugs.openCount(),
    queryFn: () => api.get("/bugs/open-count").then((r) => r.data.count as number),
    staleTime: 60_000,
    enabled,
  });
}

export function useBugActions(bugId?: string, caseId?: string) {
  const qc = useQueryClient();

  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        api.post("/bugs", data).then((r) => r.data as BugWriteResult),
      onSuccess: async (bug: BugWriteResult) => {
        toast.success(TESTING_LABELS.bugCreatedToast);
        if (bug.testCaseId) {
          qc.setQueryData(qk.cases.detail(bug.testCaseId), (old: CaseBugsCache | undefined) => {
            if (!old) return old;
            const list = old.bugs ?? [];
            if (list.some((b) => b.id === bug.id)) return old;
            return {
              ...old,
              bugs: [bug, ...list],
              _count: old._count
                ? { ...old._count, bugs: (old._count.bugs ?? list.length) + 1 }
                : old._count,
            };
          });
          if (bug.suiteId) bumpSuiteCaseBugCount(qc, bug.suiteId, bug.testCaseId, 1);
        }
        await settleBugWrite(qc, {
          bugId: bug.id,
          caseId: bug.testCaseId ?? caseId,
          suiteId: bug.suiteId,
          ticketId: bug.ticketId,
        });
      },
      onError: failTesting,
    }),
    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.patch(`/bugs/${id}`, data).then((r) => r.data as BugWriteResult),
      onSuccess: async (
        bug: BugWriteResult,
        vars: { id: string } & Record<string, unknown>,
      ) => {
        // Replace detail wholesale so cleared links (ticket/case) drop their chips.
        qc.setQueryData(qk.bugs.detail(bug.id), bug);
        const linkedCase =
          typeof vars.testCaseId === "string"
            ? vars.testCaseId
            : (bug.testCaseId ?? caseId ?? undefined);
        const previousCase =
          typeof vars.testCaseId === "undefined"
            ? undefined
            : caseId && caseId !== linkedCase
              ? caseId
              : undefined;

        if (linkedCase && vars.testCaseId !== null) {
          qc.setQueryData(
            qk.cases.detail(linkedCase),
            (old: CaseBugsCache | undefined) => {
              if (!old) return old;
              const list = old.bugs ?? [];
              const exists = list.some((b) => b.id === bug.id);
              const bugs = exists
                ? list.map((b) => (b.id === bug.id ? { ...b, ...bug } : b))
                : [bug, ...list];
              return {
                ...old,
                bugs,
                _count: old._count
                  ? {
                      ...old._count,
                      bugs: exists
                        ? (old._count.bugs ?? list.length)
                        : (old._count.bugs ?? list.length) + 1,
                    }
                  : old._count,
              };
            },
          );
          if (bug.suiteId && typeof vars.testCaseId === "string") {
            bumpSuiteCaseBugCount(qc, bug.suiteId, vars.testCaseId, 1);
          }
        }
        if (vars.testCaseId === null && caseId) {
          removeCaseBug(qc, caseId, bug.id);
          if (bug.suiteId) bumpSuiteCaseBugCount(qc, bug.suiteId, caseId, -1);
        } else if (previousCase && previousCase !== linkedCase) {
          removeCaseBug(qc, previousCase, bug.id);
          if (bug.suiteId) bumpSuiteCaseBugCount(qc, bug.suiteId, previousCase, -1);
        }
        await settleBugWrite(qc, {
          bugId: bug.id,
          caseId: linkedCase ?? caseId,
          suiteId: bug.suiteId,
        });
        if (typeof vars.ticketId === "string") {
          await qc.refetchQueries({ queryKey: qk.ticket.testing(vars.ticketId) });
        }
        if (vars.ticketId === null) {
          qc.invalidateQueries({ queryKey: qk.ticket.all });
        }
      },
      onError: failTesting,
    }),
    changeStatus: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.post(`/bugs/${id}/status`, data).then((r) => r.data),
      onSuccess: async (bug: { id: string; testCaseId?: string | null; suiteId?: string | null }) => {
        qc.setQueryData(qk.bugs.detail(bug.id), (old: Record<string, unknown> | undefined) =>
          old ? { ...old, ...bug } : bug,
        );
        if (bug.testCaseId ?? caseId) {
          const cid = bug.testCaseId ?? caseId!;
          qc.setQueryData(qk.cases.detail(cid), (old: CaseBugsCache | undefined) => {
            if (!old?.bugs) return old;
            return {
              ...old,
              bugs: old.bugs.map((b) => (b.id === bug.id ? { ...b, ...bug } : b)),
            };
          });
        }
        await settleBugWrite(qc, {
          bugId: bug.id,
          caseId: bug.testCaseId ?? caseId,
          suiteId: bug.suiteId,
        });
      },
      onError: failTesting,
    }),
    promote: useMutation({
      mutationFn: ({ id, title }: { id: string; title?: string }) =>
        api.post(`/bugs/${id}/promote`, title ? { title } : {}).then((r) => r.data),
      onSuccess: async (data, vars) => {
        await settleBugWrite(qc, { bugId: vars.id, caseId });
        toast.success(TESTING_LABELS.promoted);
        return data;
      },
      onError: failTesting,
    }),
    archive: useMutation({
      mutationFn: (id: string) => api.post(`/bugs/${id}/archive`).then((r) => r.data),
      onSuccess: async (archived, id) => {
        qc.setQueryData(
          qk.bugs.detail(id),
          (old: Record<string, unknown> | undefined) =>
            archived ?? (old ? { ...old, isArchived: true } : old),
        );
        if (caseId) removeCaseBug(qc, caseId, id);
        await settleBugWrite(qc, {
          bugId: id,
          caseId,
          suiteId: (archived as { suiteId?: string } | undefined)?.suiteId,
        });
      },
      onError: failTesting,
    }),
    unarchive: useMutation({
      mutationFn: (id: string) => api.post(`/bugs/${id}/unarchive`).then((r) => r.data),
      onSuccess: async (live, id) => {
        toast.success(TESTING_LABELS.bugUnarchivedToast);
        qc.setQueryData(qk.bugs.detail(id), live);
        await settleBugWrite(qc, {
          bugId: id,
          caseId,
          suiteId: (live as { suiteId?: string } | undefined)?.suiteId,
        });
      },
      onError: failTesting,
    }),
  };
}
