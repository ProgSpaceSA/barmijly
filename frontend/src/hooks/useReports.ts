"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { DeveloperStat } from "@/lib/report-charts";

export function useDashboardStats(companyId?: string) {
  return useQuery({
    queryKey: qk.reports.dashboard(companyId),
    queryFn: () => api.get("/reports/dashboard", { params: { companyId } }).then(r => r.data),
  });
}

/** `enabled: false` for roles without report:read-team — the API answers 403. */
export function useDeveloperStats(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.reports.developers(),
    queryFn: () => api.get("/reports/developers").then((r) => r.data as DeveloperStat[]),
    enabled: options?.enabled ?? true,
  });
}

export function useOverdueTickets() {
  return useQuery({
    queryKey: qk.reports.overdue(),
    queryFn: () => api.get("/reports/overdue").then(r => r.data),
  });
}

/** `enabled: false` for roles without report:read-team — the API answers 403. */
export function useTicketTrend(months = 6, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.reports.trend(months),
    queryFn: () => api.get("/reports/trend", { params: { months } }).then(r => r.data),
    enabled: options?.enabled ?? true,
  });
}
