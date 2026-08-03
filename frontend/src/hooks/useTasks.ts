"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useMyTasks() {
  return useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => api.get("/tasks/my").then(r => r.data),
    staleTime: 30_000,
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/tasks/${id}`, { status }).then(r => r.data),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["my-tasks"] });
      const prev = qc.getQueryData(["my-tasks"]);
      qc.setQueryData(["my-tasks"], (old: any[]) =>
        old?.map(t => (t.id === id ? { ...t, status } : t)) ?? old
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["my-tasks"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
    },
  });
}
