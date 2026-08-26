"use client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { failTesting, refreshTestingWorkspace } from "@/hooks/useTestSuites";
import { TESTING_LABELS } from "@/lib/constants";

/**
 * Cases and their ordered steps.
 *
 * Structural writes settle through `refreshTestingWorkspace` (awaited refetch)
 * so the suite rail and case pane never sit on stale cache until a hard refresh.
 *
 * Field autosaves must never write the *whole* case row into the cache. A
 * debounced title PATCH that left the wire before a result/bug/ticket write
 * can land afterward and overwrite lastResult, bugs, or ticket until refresh.
 * Only the keys that mutation actually changed are applied.
 */
async function settleCaseWrite(qc: QueryClient, suiteId?: string, caseId?: string) {
  await refreshTestingWorkspace(qc, { suiteId, caseId });
}

/** Apply a narrow patch onto the case detail cache — never replace the row. */
function applyCaseDetailPatch(
  qc: QueryClient,
  caseId: string,
  patch: Record<string, unknown>,
  fallback?: Record<string, unknown>,
) {
  qc.setQueryData(qk.cases.detail(caseId), (old: Record<string, unknown> | undefined) => {
    if (!old) return fallback ? { ...fallback, ...patch } : { id: caseId, ...patch };
    return { ...old, ...patch };
  });
}

/**
 * Patch only the fields this mutation owns onto the suite rail row.
 * Spreading a full CASE_INCLUDE response here races sibling writes.
 */
function patchSuiteCase(
  qc: QueryClient,
  suiteId: string | undefined,
  caseId: string,
  patch: Record<string, unknown>,
) {
  if (!suiteId) return;
  qc.setQueryData(qk.suites.detail(suiteId), (old: { cases?: { id: string }[] } | undefined) => {
    if (!old?.cases) return old;
    if (!old.cases.some((c) => c.id === caseId)) return old;
    return {
      ...old,
      cases: old.cases.map((c) => (c.id === caseId ? { ...c, ...patch } : c)),
    };
  });
}

/** Map a PATCH body onto cache fields, including FK → relation pairs. */
function fieldsFromCasePatch(
  updated: Record<string, unknown>,
  vars: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(vars)) {
    if (key === "id") continue;
    if (key === "ticketId") {
      patch.ticketId = updated.ticketId ?? vars.ticketId ?? null;
      patch.ticket = updated.ticket ?? null;
      continue;
    }
    if (key === "assignedToId") {
      patch.assignedToId = updated.assignedToId ?? vars.assignedToId ?? null;
      patch.assignedTo = updated.assignedTo ?? null;
      continue;
    }
    if (key in updated) patch[key] = updated[key];
  }
  return patch;
}

function removeSuiteCase(qc: QueryClient, suiteId: string | undefined, caseId: string) {
  if (!suiteId) return;
  qc.setQueryData(qk.suites.detail(suiteId), (old: { cases?: { id: string }[] } | undefined) => {
    if (!old?.cases) return old;
    return { ...old, cases: old.cases.filter((c) => c.id !== caseId) };
  });
  qc.removeQueries({ queryKey: qk.cases.detail(caseId) });
}

/** Prepend a brand-new case into the suite workspace list. */
function prependSuiteCase(qc: QueryClient, suiteId: string | undefined, created: { id: string }) {
  if (!suiteId) return;
  qc.setQueryData(qk.suites.detail(suiteId), (old: { cases?: unknown[] } | undefined) => {
    if (!old) {
      qc.invalidateQueries({ queryKey: qk.suites.detail(suiteId) });
      return old;
    }
    const list = old.cases ?? [];
    if (list.some((c) => (c as { id: string }).id === created.id)) return old;
    return { ...old, cases: [created, ...list] };
  });
  qc.setQueryData(qk.cases.detail(created.id), created);
}

export function useSuiteCases(suiteId: string) {
  return useQuery({
    queryKey: qk.cases.bySuite(suiteId),
    queryFn: () => api.get(`/test-suites/${suiteId}/cases`).then((r) => r.data),
    enabled: !!suiteId,
  });
}

export function useTestCase(id: string) {
  return useQuery({
    queryKey: qk.cases.detail(id),
    queryFn: () => api.get(`/test-cases/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCaseActions(suiteId?: string, caseId?: string) {
  const qc = useQueryClient();

  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        api.post(`/test-suites/${suiteId}/cases`, data).then((r) => r.data),
      onSuccess: async (created: { id: string }) => {
        prependSuiteCase(qc, suiteId, created);
        await settleCaseWrite(qc, suiteId, created.id);
        toast.success(TESTING_LABELS.caseCreatedToast);
      },
      onError: failTesting,
    }),
    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.patch(`/test-cases/${id}`, data).then((r) => r.data),
      onSuccess: async (
        updated: { id: string } & Record<string, unknown>,
        vars: { id: string } & Record<string, unknown>,
      ) => {
        const patch = fieldsFromCasePatch(updated, vars);
        applyCaseDetailPatch(qc, updated.id, patch, updated);
        patchSuiteCase(qc, suiteId, updated.id, patch);
        // Field autosaves must NOT refetch the suite — that races bug links.
        // Ticket links need a settle so the chip and ticket testing section match.
        if ("ticketId" in vars) {
          toast.success(
            vars.ticketId ? TESTING_LABELS.caseTicketLinked : TESTING_LABELS.caseTicketCleared,
          );
          await settleCaseWrite(qc, suiteId, updated.id);
        }
      },
      onError: failTesting,
    }),
    publish: useMutation({
      mutationFn: (id: string) => api.post(`/test-cases/${id}/publish`).then((r) => r.data),
      onSuccess: async (updated: { id: string; state?: string }) => {
        const patch = { state: updated.state ?? "ACTIVE" };
        applyCaseDetailPatch(qc, updated.id, patch, updated as Record<string, unknown>);
        patchSuiteCase(qc, suiteId, updated.id, patch);
        await settleCaseWrite(qc, suiteId, updated.id);
        toast.success(TESTING_LABELS.casePublished);
      },
      onError: failTesting,
    }),
    recordResult: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.post(`/test-cases/${id}/result`, data).then((r) => r.data),
      onSuccess: async (
        updated: {
          id: string;
          lastResult?: string;
          lastRunAt?: string | null;
          lastRunBy?: unknown;
          lastRunById?: string | null;
          actualResult?: string | null;
        },
      ) => {
        const patch: Record<string, unknown> = {
          lastResult: updated.lastResult,
          lastRunAt: updated.lastRunAt,
          lastRunBy: updated.lastRunBy,
          lastRunById: updated.lastRunById,
        };
        if (updated.actualResult !== undefined) patch.actualResult = updated.actualResult;
        applyCaseDetailPatch(qc, updated.id, patch, updated as Record<string, unknown>);
        patchSuiteCase(qc, suiteId, updated.id, patch);
        await settleCaseWrite(qc, suiteId, updated.id);
      },
      onError: failTesting,
    }),
    reorder: useMutation({
      mutationFn: ({ id, order }: { id: string; order: number }) =>
        api.post(`/test-cases/${id}/reorder`, { order }).then((r) => r.data),
      onSuccess: async () => {
        await settleCaseWrite(qc, suiteId, caseId);
      },
      onError: failTesting,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/test-cases/${id}`).then((r) => r.data),
      onSuccess: async (_data, id) => {
        removeSuiteCase(qc, suiteId, id);
        await settleCaseWrite(qc, suiteId, id);
        toast.success(TESTING_LABELS.caseArchived);
      },
      onError: failTesting,
    }),
  };
}

export function useCaseSteps(caseId: string) {
  return useQuery({
    queryKey: qk.cases.steps(caseId),
    queryFn: () => api.get(`/test-cases/${caseId}/steps`).then((r) => r.data),
    enabled: !!caseId,
  });
}

export function useBugSteps(bugId: string) {
  return useQuery({
    queryKey: qk.bugs.steps(bugId),
    queryFn: () => api.get(`/bugs/${bugId}/steps`).then((r) => r.data),
    enabled: !!bugId,
  });
}

/**
 * Step writes for either owner.
 *
 * `PATCH`, reorder and delete are one set of routes whichever list the step is
 * in — the rows are the same table — so the hook takes the owner only to know
 * which cache to settle, and `add` to know which collection to append to.
 */
export function useStepActions(owner: { caseId?: string; bugId?: string; suiteId?: string }) {
  const qc = useQueryClient();
  const settle = async () => {
    if (owner.caseId) {
      await qc.refetchQueries({ queryKey: qk.cases.steps(owner.caseId) });
      await settleCaseWrite(qc, owner.suiteId, owner.caseId);
    }
    if (owner.bugId) {
      await qc.refetchQueries({ queryKey: qk.bugs.steps(owner.bugId) });
      qc.invalidateQueries({ queryKey: qk.bugs.all });
      if (owner.suiteId) {
        await qc.refetchQueries({ queryKey: qk.suites.detail(owner.suiteId) });
      }
    }
  };

  const patchStepList = (listKey: readonly unknown[], updated: { id: string; body?: string }) => {
    qc.setQueryData(listKey, (old: { id: string }[] | undefined) => {
      if (!Array.isArray(old)) return old;
      return old.map((s) => (s.id === updated.id ? { ...s, ...updated } : s));
    });
  };

  return {
    /**
     * Refetches the step list on its own. Uploading a screenshot goes through
     * the attachments endpoint, not a step route, so nothing else would tell
     * the list its thumbnail has changed.
     */
    refresh: () => {
      void settle();
    },
    add: useMutation({
      mutationFn: (body: string) =>
        api
          .post(
            owner.caseId ? `/test-cases/${owner.caseId}/steps` : `/bugs/${owner.bugId}/steps`,
            { body },
          )
          .then((r) => r.data),
      onSuccess: async (created: { id: string }) => {
        const key = owner.caseId ? qk.cases.steps(owner.caseId) : qk.bugs.steps(owner.bugId!);
        qc.setQueryData(key, (old: unknown[] | undefined) =>
          Array.isArray(old) ? [...old, created] : [created],
        );
        await settle();
      },
      onError: failTesting,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) =>
        api.patch(`/test-steps/${id}`, { body }).then((r) => r.data),
      onSuccess: async (updated: { id: string; body: string }) => {
        if (owner.caseId) patchStepList(qk.cases.steps(owner.caseId), updated);
        if (owner.bugId) patchStepList(qk.bugs.steps(owner.bugId), updated);
        await settle();
      },
      onError: failTesting,
    }),
    reorder: useMutation({
      mutationFn: ({ id, order }: { id: string; order: number }) =>
        api.post(`/test-steps/${id}/reorder`, { order }).then((r) => r.data),
      onSuccess: async () => {
        await settle();
      },
      onError: failTesting,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/test-steps/${id}`).then((r) => r.data),
      onSuccess: async (_data, id) => {
        const key = owner.caseId
          ? qk.cases.steps(owner.caseId)
          : owner.bugId
            ? qk.bugs.steps(owner.bugId)
            : null;
        if (key) {
          qc.setQueryData(key, (old: { id: string }[] | undefined) =>
            Array.isArray(old) ? old.filter((s) => s.id !== id) : old,
          );
        }
        await settle();
      },
      onError: failTesting,
    }),
  };
}
