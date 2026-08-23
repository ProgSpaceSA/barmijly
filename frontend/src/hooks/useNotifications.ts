"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";

function invalidateNotificationQueries(qc: ReturnType<typeof useQueryClient>) {
  // One prefix: the pages, the unread count, and anything added under them.
  qc.invalidateQueries({ queryKey: qk.notifications.all });
  // The created-tickets feed carries the per-ticket unread badge.
  qc.invalidateQueries({ queryKey: qk.tickets.myCreated() });
}

export function useNotifications(page = 1, unreadOnly = false, enabled = true) {
  return useQuery({
    queryKey: qk.notifications.page(page, unreadOnly),
    queryFn: () => api.get(`/notifications?page=${page}&unreadOnly=${unreadOnly}`).then(r => r.data),
    refetchInterval: 30_000,
    enabled,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: qk.notifications.unreadCount(),
    queryFn: () => api.get("/notifications/unread-count").then(r => r.data),
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => invalidateNotificationQueries(qc),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: () => invalidateNotificationQueries(qc),
  });
}

export function useMarkTicketRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => api.patch(`/notifications/ticket/${ticketId}/read`),
    onMutate: async (ticketId) => {
      await qc.cancelQueries({ queryKey: qk.tickets.myCreated() });
      qc.setQueryData(qk.tickets.myCreated(), (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((t: { id: string; unreadCount?: number; hasUpdates?: boolean }) =>
          t.id === ticketId ? { ...t, unreadCount: 0, hasUpdates: false } : t,
        );
      });
    },
    onSuccess: () => invalidateNotificationQueries(qc),
  });
}
