"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

export function useTickets(filters: Record<string, string> = {}) {
  const params = new URLSearchParams(filters).toString();
  return useQuery({
    queryKey: ["tickets", filters],
    queryFn: () => api.get(`/tickets?${params}`).then(r => r.data),
  });
}

export function useMyCreatedTickets() {
  return useQuery({
    queryKey: ["my-created-tickets"],
    queryFn: () => api.get("/tickets/my-created").then(r => r.data),
    staleTime: 30_000,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ["ticket", id],
    queryFn: () => api.get(`/tickets/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post("/tickets", data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); toast.success("تم إنشاء التذكرة"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ"),
  });
}

export function useTicketAction(id: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["my-created-tickets"] });
  };
  return {
    submit: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/submit`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم إرسال التذكرة"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    approve: useMutation({ mutationFn: (data: any) => api.patch(`/tickets/${id}/approve`, data).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم اتخاذ القرار"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    assign: useMutation({ mutationFn: (data: any) => api.patch(`/tickets/${id}/assign`, data).then(r => r.data), onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["ticket-tasks", id] }); qc.invalidateQueries({ queryKey: ["my-tasks"] }); toast.success("تم الإسناد"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    startWork: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/start`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("بدأ العمل"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    submitForTesting: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/submit-for-testing`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("جاهز للاختبار"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    approveCompletion: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/approve-completion`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم الاعتماد"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    close: useMutation({ mutationFn: (data: any) => api.patch(`/tickets/${id}/close`, data).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم الإغلاق"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    archive: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/archive`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم الأرشفة"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    unarchive: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/unarchive`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم إلغاء الأرشفة"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    reopen: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/reopen`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تمت إعادة الفتح"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    forceStatus: useMutation({ mutationFn: (data: { status: string; reason?: string }) => api.patch(`/tickets/${id}/force-status`, data).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم تغيير الحالة"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
  };
}

/**
 * Posting, editing, and deleting stay quiet on purpose: a comment can carry
 * attachments, and the thread only refreshes and reports once every upload has
 * landed. Toasting or invalidating here would announce a half-uploaded comment.
 */
export function useAddComment(ticketId: string) {
  return useMutation({
    mutationFn: (data: { content: string; visibility?: string; mentions?: string[] }) =>
      api.post(`/tickets/${ticketId}/comments`, data).then(r => r.data),
  });
}

export function useUpdateComment(ticketId: string) {
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; content: string; mentions?: string[] }) =>
      api.patch(`/tickets/${ticketId}/comments/${id}`, data).then(r => r.data),
  });
}

export function useDeleteComment(ticketId: string) {
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/tickets/${ticketId}/comments/${id}`).then(r => r.data),
  });
}
