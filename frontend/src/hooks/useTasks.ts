"use client";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";

/**
 * A task write is never only a task write.
 *
 * Holding a task puts the assignee on the ticket roster and feeds the ticket's
 * estimate rollup and open-task count, so every one of these has to refresh the
 * ticket and its roster too — not just the task list.
 */
function settleTaskWrite(qc: QueryClient, ticketId: string) {
  // Prefix: the ticket detail plus its task list, roster and activity log.
  qc.invalidateQueries({ queryKey: qk.ticket.detail(ticketId) });
  qc.invalidateQueries({ queryKey: qk.tasks.all });
  // Open-task counts and the estimate rollup ride along on the list cards.
  qc.invalidateQueries({ queryKey: qk.tickets.all });
}

const failTask = (e: { response?: { data?: { message?: string } } }) =>
  toast.error(e.response?.data?.message || "حدث خطأ");

export function useTicketTasks(ticketId: string) {
  return useQuery({
    queryKey: qk.ticket.tasks(ticketId),
    queryFn: () => api.get(`/tickets/${ticketId}/tasks`).then(r => r.data),
    enabled: !!ticketId,
  });
}

export function useTaskActions(ticketId: string) {
  const qc = useQueryClient();
  const settled = { onSuccess: () => settleTaskWrite(qc, ticketId), onError: failTask };
  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        api.post(`/tickets/${ticketId}/tasks`, data).then(r => r.data),
      ...settled,
    }),
    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.patch(`/tasks/${id}`, data).then(r => r.data),
      ...settled,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/tasks/${id}`).then(r => r.data),
      ...settled,
    }),
  };
}

export function useMyTasks() {
  return useQuery({
    queryKey: qk.tasks.mine(),
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
      await qc.cancelQueries({ queryKey: qk.tasks.mine() });
      const prev = qc.getQueryData(qk.tasks.mine());
      qc.setQueryData(qk.tasks.mine(), (old: any[]) =>
        old?.map(t => (t.id === id ? { ...t, status } : t)) ?? old
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.tasks.mine(), ctx.prev);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      // The hub and the ticket page show the same task; moving it on one must
      // not leave the other showing the previous status — and the ticket itself
      // carries the open-task count that gates «إرسال للاختبار».
      qc.invalidateQueries({ queryKey: qk.ticket.all });
      qc.invalidateQueries({ queryKey: qk.tickets.all });
      void vars;
    },
  });
}
