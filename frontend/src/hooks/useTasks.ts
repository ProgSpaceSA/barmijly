"use client";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";

function patchTaskList(
  list: unknown,
  taskId: string,
  patch: Record<string, unknown>,
) {
  if (!Array.isArray(list)) return list;
  return list.map((t: { id: string }) => (t.id === taskId ? { ...t, ...patch } : t));
}

/**
 * A task write is never only a task write.
 *
 * Holding a task puts the assignee on the ticket roster and feeds the ticket's
 * estimate rollup and open-task count, so every one of these has to refresh the
 * ticket and its roster too — not just the task list.
 */
function settleTaskWrite(qc: QueryClient, ticketId: string) {
  qc.invalidateQueries({ queryKey: qk.ticket.detail(ticketId) });
  qc.invalidateQueries({ queryKey: qk.ticket.tasks(ticketId) });
  qc.invalidateQueries({ queryKey: qk.ticket.timeline(ticketId) });
  qc.invalidateQueries({ queryKey: qk.tasks.all });
  qc.invalidateQueries({ queryKey: qk.tickets.all });
  void qc.refetchQueries({ queryKey: qk.ticket.tasks(ticketId), type: "active" });
}

const failTask = (e: unknown) => {
  const message =
    e && typeof e === "object" && "response" in e
      ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
      : undefined;
  toast.error(message || "حدث خطأ");
};

export function useTicketTasks(ticketId: string) {
  return useQuery({
    queryKey: qk.ticket.tasks(ticketId),
    queryFn: () => api.get(`/tickets/${ticketId}/tasks`).then(r => r.data),
    enabled: !!ticketId,
  });
}

export function useTaskActions(ticketId: string) {
  const qc = useQueryClient();
  const fail = failTask;
  const settled = () => settleTaskWrite(qc, ticketId);
  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        api.post(`/tickets/${ticketId}/tasks`, data).then(r => r.data),
      onSuccess: settled,
      onError: fail,
    }),
    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.patch(`/tasks/${id}`, data).then(r => r.data),
      onMutate: async (vars) => {
        const { id, ...patch } = vars;
        const tasksKey = qk.ticket.tasks(ticketId);
        await qc.cancelQueries({ queryKey: tasksKey });
        const prevTasks = qc.getQueryData(tasksKey);
        qc.setQueryData(tasksKey, (old) => patchTaskList(old, id, patch));
        return { prevTasks, tasksKey };
      },
      onError: (err, _vars, ctx) => {
        if (ctx?.prevTasks !== undefined) qc.setQueryData(ctx.tasksKey, ctx.prevTasks);
        fail(err);
      },
      onSuccess: (data) => {
        if (data?.id) {
          qc.setQueryData(qk.ticket.tasks(ticketId), (old) => patchTaskList(old, data.id, data));
        }
        settled();
      },
    }),
    /**
     * Managers only — the API refuses everyone else.
     *
     * The server answers with the whole list in its new order, so it is written
     * straight into the cache: a reorder renumbers every row and releases or
     * traps whatever sits under a blocker, which no per-row patch can express.
     */
    reorder: useMutation({
      mutationFn: ({ id, order }: { id: string; order: number }) =>
        api.post(`/tasks/${id}/reorder`, { order }).then(r => r.data),
      onSuccess: (data) => {
        if (Array.isArray(data)) qc.setQueryData(qk.ticket.tasks(ticketId), data);
        settled();
      },
      onError: fail,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/tasks/${id}`).then(r => r.data),
      onSuccess: settled,
      onError: fail,
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
    onSuccess: (data, { id }) => {
      qc.setQueryData(qk.tasks.mine(), (old: unknown) => patchTaskList(old, id, data ?? {}));
      if (data?.ticketId) {
        qc.setQueryData(qk.ticket.tasks(data.ticketId), (old) => patchTaskList(old, id, data));
      }
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.ticket.all });
      qc.invalidateQueries({ queryKey: qk.tickets.all });
      void vars;
    },
  });
}
