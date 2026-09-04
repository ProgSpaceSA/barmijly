"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { HUB_LABELS } from "@/lib/constants";

export type HubGuide = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function failGuide(error: unknown) {
  const message =
    (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  toast.error(Array.isArray(message) ? message[0] : (message ?? HUB_LABELS.loadFailed));
}

export function useGuides(enabled = true) {
  return useQuery<HubGuide[]>({
    queryKey: qk.guides.list(),
    queryFn: () => api.get("/guides").then((r) => r.data),
    enabled,
  });
}

export function useGuideActions() {
  const qc = useQueryClient();
  const settle = () => qc.invalidateQueries({ queryKey: qk.guides.all });

  const create = useMutation({
    mutationFn: (data: { title: string; summary: string; steps: string[] }) =>
      api.post("/guides", data).then((r) => r.data),
    onSuccess: () => {
      settle();
      toast.success(HUB_LABELS.guideCreated);
    },
    onError: failGuide,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      summary?: string;
      steps?: string[];
      sortOrder?: number;
    }) => api.patch(`/guides/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      settle();
      toast.success(HUB_LABELS.guideUpdated);
    },
    onError: failGuide,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/guides/${id}`).then((r) => r.data),
    onSuccess: () => {
      settle();
      toast.success(HUB_LABELS.guideDeleted);
    },
    onError: failGuide,
  });

  return { create, update, remove };
}
