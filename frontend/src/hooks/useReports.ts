"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useDashboardStats(companyId?: string) {
  return useQuery({
    queryKey: ["reports-dashboard", companyId],
    queryFn: () => api.get("/reports/dashboard", { params: { companyId } }).then(r => r.data),
  });
}

export function useDeveloperStats() {
  return useQuery({
    queryKey: ["reports-developers"],
    queryFn: () => api.get("/reports/developers").then(r => r.data),
  });
}

export function useOverdueTickets() {
  return useQuery({
    queryKey: ["reports-overdue"],
    queryFn: () => api.get("/reports/overdue").then(r => r.data),
  });
}

export function useTicketTrend(months = 6) {
  return useQuery({
    queryKey: ["reports-trend", months],
    queryFn: () => api.get("/reports/trend", { params: { months } }).then(r => r.data),
  });
}
