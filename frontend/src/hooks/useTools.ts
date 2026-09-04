"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { HUB_LABELS } from "@/lib/constants";

export type ToolPerson = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
};

export type Tool = {
  id: string;
  name: string;
  website: string;
  description: string;
  gettingStarted: string;
  categories: string[];
  teams: string[];
  status: "REQUESTED" | "APPROVED" | "DECLINED" | "RETIRED";
  requestedById: string;
  requestedBy?: ToolPerson | null;
  decidedBy?: ToolPerson | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt: string;
};

export type ToolList = {
  data: Tool[];
  total: number;
  approvedCount: number;
  pendingCount: number;
};

function failTool(error: unknown) {
  const message =
    (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  toast.error(
    Array.isArray(message) ? message[0] : (message ?? HUB_LABELS.loadFailed),
  );
}

export function useTools(filters: Record<string, string> = {}, enabled = true) {
  return useQuery<ToolList>({
    queryKey: qk.tools.list(filters),
    queryFn: () => api.get("/tools", { params: filters }).then((r) => r.data),
    enabled,
  });
}

/**
 * Badge on the hub's «الطلبات» tab. Asked for only by roles that can decide —
 * the endpoint answers 0 for everyone else, and asking anyway would be a
 * request per page load that can never show anything.
 */
export function usePendingToolCount(enabled = true) {
  return useQuery({
    queryKey: qk.tools.pendingCount(),
    queryFn: () => api.get("/tools/pending-count").then((r) => r.data.count as number),
    staleTime: 60_000,
    enabled,
  });
}

/**
 * Every write settles the whole `tools` prefix: a decision moves a row between
 * the catalogue and the pending queue, and both are read off that prefix, so
 * refreshing one and not the other is what would leave an approved tool sitting
 * in the queue until a reload.
 */
export function useToolActions() {
  const qc = useQueryClient();

  const settle = () => {
    qc.invalidateQueries({ queryKey: qk.tools.all });
  };

  return {
    request: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        api.post("/tools", data).then((r) => r.data as Tool),
      onSuccess: () => {
        toast.success(HUB_LABELS.toolRequested);
        settle();
      },
      onError: failTool,
    }),

    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.patch(`/tools/${id}`, data).then((r) => r.data as Tool),
      onSuccess: () => {
        toast.success(HUB_LABELS.toolUpdated);
        settle();
      },
      onError: failTool,
    }),

    approve: useMutation({
      mutationFn: (id: string) => api.post(`/tools/${id}/approve`).then((r) => r.data as Tool),
      onSuccess: () => {
        toast.success(HUB_LABELS.toolApproved);
        settle();
      },
      onError: failTool,
    }),

    decline: useMutation({
      mutationFn: ({ id, note }: { id: string; note: string }) =>
        api.post(`/tools/${id}/decline`, { note }).then((r) => r.data as Tool),
      onSuccess: () => {
        toast.success(HUB_LABELS.toolDeclined);
        settle();
      },
      onError: failTool,
    }),

    retire: useMutation({
      mutationFn: ({ id, note }: { id: string; note: string }) =>
        api.post(`/tools/${id}/retire`, { note }).then((r) => r.data as Tool),
      onSuccess: () => {
        toast.success(HUB_LABELS.toolRetired);
        settle();
      },
      onError: failTool,
    }),
  };
}
