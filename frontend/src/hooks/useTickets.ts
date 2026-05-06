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
  };
  return {
    submit: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/submit`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم إرسال التذكرة"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    approve: useMutation({ mutationFn: (data: any) => api.patch(`/tickets/${id}/approve`, data).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم اتخاذ القرار"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    assign: useMutation({ mutationFn: (data: any) => api.patch(`/tickets/${id}/assign`, data).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم الإسناد"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    startWork: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/start`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("بدأ العمل"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    submitForTesting: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/submit-for-testing`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("جاهز للاختبار"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    approveCompletion: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/approve-completion`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم الاعتماد"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    close: useMutation({ mutationFn: (data: any) => api.patch(`/tickets/${id}/close`, data).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم الإغلاق"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    archive: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/archive`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تم الأرشفة"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
    reopen: useMutation({ mutationFn: () => api.patch(`/tickets/${id}/reopen`).then(r => r.data), onSuccess: () => { invalidate(); toast.success("تمت إعادة الفتح"); }, onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ") }),
  };
}

export function useAddComment(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post(`/tickets/${ticketId}/comments`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ticket", ticketId] }); toast.success("تم إضافة التعليق"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ"),
  });
}
