"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { HUB_LABELS } from "@/lib/constants";

export type FeedbackPerson = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
};

export type FeedbackKind = "IMPROVEMENT" | "COMPLAINT" | "INQUIRY";
export type FeedbackStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export type Feedback = {
  id: string;
  title: string;
  body: string;
  kind: FeedbackKind;
  status: FeedbackStatus;
  proposedSolution?: string | null;
  resolutionNote?: string | null;
  createdById: string;
  createdBy?: FeedbackPerson | null;
  assigneeId?: string | null;
  assignee?: FeedbackPerson | null;
  createdAt: string;
};

export type FeedbackList = {
  data: Feedback[];
  total: number;
  inboxCount: number;
};

function failFeedback(error: unknown) {
  const message =
    (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  toast.error(Array.isArray(message) ? message[0] : (message ?? HUB_LABELS.loadFailed));
}

function isFeedbackList(value: unknown): value is FeedbackList {
  return Boolean(value && typeof value === "object" && Array.isArray((value as FeedbackList).data));
}

export function useFeedback(filters: Record<string, string> = {}, enabled = true) {
  return useQuery<FeedbackList>({
    queryKey: qk.feedback.list(filters),
    queryFn: ({ signal }) => api.get("/feedback", { params: filters, signal }).then((r) => r.data),
    staleTime: 0,
    enabled,
  });
}

export function useFeedbackInboxCount(enabled = true) {
  return useQuery({
    queryKey: qk.feedback.inboxCount(),
    queryFn: ({ signal }) =>
      api.get("/feedback/inbox-count", { signal }).then((r) => r.data.count as number),
    staleTime: 60_000,
    enabled,
  });
}

export function useFeedbackActions() {
  const qc = useQueryClient();

  const settle = () => qc.refetchQueries({ queryKey: qk.feedback.all });

  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        api.post("/feedback", data).then((r) => r.data as Feedback),
      onSuccess: async (row) => {
        toast.success(HUB_LABELS.feedbackCreated);
        qc.setQueriesData({ queryKey: qk.feedback.all }, (current) => {
          if (!isFeedbackList(current)) return current;
          if (current.data.some((item) => item.id === row.id)) return current;
          return { ...current, data: [row, ...current.data], total: current.total + 1 };
        });
        await settle();
      },
      onError: failFeedback,
    }),

    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.patch(`/feedback/${id}`, data).then((r) => r.data as Feedback),
      onSuccess: async () => {
        toast.success(HUB_LABELS.feedbackUpdated);
        await settle();
      },
      onError: failFeedback,
    }),
  };
}
