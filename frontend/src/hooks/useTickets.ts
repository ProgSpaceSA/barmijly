"use client";
import { useQuery, useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { DEPENDENCY_LABELS } from "@/lib/constants";
import { qk } from "@/lib/query-keys";

type TicketCache = {
  status?: string;
  updatedAt?: string;
  isArchived?: boolean;
};

function ticketTime(ticket: unknown): number {
  if (!ticket || typeof ticket !== "object") return 0;
  const parsed = Date.parse(String((ticket as TicketCache).updatedAt ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Merge a mutation payload onto the cached detail without dropping relations.
 *
 * Generic on purpose: these helpers only *choose between* two copies of a
 * ticket, so they must hand back the type they were given. Returning `unknown`
 * collapses `useTicket().data` to `{}` at every call site.
 */
export function mergeTicketCache<T>(old: T, updated: unknown): T {
  if (!updated || typeof updated !== "object") return old;
  if (!old || typeof old !== "object") return updated as T;
  return { ...old, ...updated };
}

/**
 * The only columns a just-landed write owns, and therefore the only ones worth
 * defending against a GET that left the server before it.
 *
 * Relations are deliberately absent: comments, history, attachments and the
 * roster are read-only here, so the fetched copy is always at least as new as
 * the one in the cache. Keeping the cached copy of those — which is what a
 * blanket merge does — freezes the thread and the activity log on screen until
 * the reader reloads the page.
 */
const WRITE_OWNED_FIELDS = [
  "status",
  "updatedAt",
  "scheduledStart",
  "estimatedDeadline",
  "estimatedHours",
  "difficultyLevel",
  "finalPriority",
  "isArchived",
] as const;

/**
 * An in-flight GET that started before a status change can land afterwards
 * and overwrite the cache with the previous status. Prefer the newer copy.
 */
export function keepNewerTicket<T>(cached: unknown, fetched: T): T {
  if (!fetched || typeof fetched !== "object") return fetched;
  if (ticketTime(cached) <= ticketTime(fetched)) return fetched;
  if (!cached || typeof cached !== "object") return fetched;
  const row = cached as Record<string, unknown>;
  const defended: Record<string, unknown> = {};
  for (const field of WRITE_OWNED_FIELDS) {
    if (field in row) defended[field] = row[field];
  }
  return { ...fetched, ...defended };
}

/**
 * A timestamp one tick past what the cache already holds.
 *
 * `Date.now()` would work only while the browser clock trails the API server's.
 * When it runs ahead, an optimistic write stamps a future time, every later GET
 * looks older than the cache, and the ticket stops updating for the rest of the
 * session — the exact bug this whole comparison exists to prevent.
 */
function nextTicketTime(cached: unknown) {
  return new Date(ticketTime(cached) + 1).toISOString();
}

export function useTickets(filters: Record<string, string> = {}) {
  const params = new URLSearchParams(filters).toString();
  return useQuery({
    queryKey: qk.tickets.list(filters),
    queryFn: () => api.get(`/tickets?${params}`).then(r => r.data),
  });
}

export function useMyCreatedTickets() {
  return useQuery({
    queryKey: qk.tickets.myCreated(),
    queryFn: () => api.get("/tickets/my-created").then(r => r.data),
    staleTime: 30_000,
  });
}

export function useTicket(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.ticket.detail(id),
    queryFn: async () => {
      const fetched = await api.get(`/tickets/${id}`).then(r => r.data);
      return keepNewerTicket(qc.getQueryData(qk.ticket.detail(id)), fetched);
    },
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/tickets", data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.tickets.all }); toast.success("تم إنشاء التذكرة"); },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message || "حدث خطأ"),
  });
}

function failAction(e: { response?: { data?: { message?: string | string[] } } } | Error | unknown) {
  const data =
    e && typeof e === "object" && "response" in e
      ? (e as { response?: { data?: { message?: string | string[] } } }).response?.data
      : undefined;
  toast.error(apiErrorMessage(data) || "حدث خطأ");
}

function apiErrorMessage(data: { message?: string | string[] } | undefined) {
  const raw = data?.message;
  return Array.isArray(raw) ? raw[0] : raw;
}

function failDependencyAction(e: { response?: { data?: { message?: string | string[] } } }) {
  const msg = apiErrorMessage(e.response?.data);
  if (msg === DEPENDENCY_LABELS.alreadyAdded) toast.info(msg);
  else failAction(e);
}

type TicketMutationOptions = {
  /** Inline panels show their own hint — skip the toast. */
  silentSuccess?: boolean;
  /** Apply vars to the ticket cache before the server responds. */
  optimistic?: boolean;
  /**
   * An inline editor saving a field rather than a workflow transition. The PATCH
   * already returns the whole ticket, so refetching it would race whatever the
   * user is still typing, and only the activity log moves with it — the roster,
   * the task list and the prerequisites are untouched by a field edit.
   */
  inlineEdit?: boolean;
};

function useTicketMutation<T extends Record<string, unknown> | undefined>(
  qc: QueryClient,
  id: string,
  mutationFn: (vars: T) => Promise<unknown>,
  successMessage: string,
  extraKeys: QueryKey[] = [],
  options: TicketMutationOptions = {},
) {
  const ticketKey = qk.ticket.detail(id);
  return useMutation({
    mutationFn,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ticketKey, exact: true });
      const previous = qc.getQueryData(ticketKey);
      if (options.optimistic && vars && typeof vars === "object") {
        qc.setQueryData(ticketKey, (old: unknown) =>
          mergeTicketCache(old, { ...vars, updatedAt: nextTicketTime(old) }),
        );
      }
      return { previous };
    },
    onSuccess: (updated) => {
      qc.setQueryData(ticketKey, (old: unknown) => mergeTicketCache(old, updated));
      // `exact` so the sub-resources below are not refetched twice.
      if (!options.inlineEdit) qc.invalidateQueries({ queryKey: ticketKey, exact: true });
      // A transition moves more than the row: history, roster, prerequisites and
      // the task list are all read off it.
      const subResources = options.inlineEdit ? [qk.ticket.timeline(id)] : qk.ticketSubResources(id);
      for (const key of subResources) qc.invalidateQueries({ queryKey: key });
      // One prefix covers the list, the dashboard feed, and the per-company and
      // per-user views built from the same rows.
      qc.invalidateQueries({ queryKey: qk.tickets.all });
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      for (const key of extraKeys) qc.invalidateQueries({ queryKey: key });
      if (!options.silentSuccess) toast.success(successMessage);
    },
    onError: (err, _vars, context) => {
      if (context?.previous !== undefined) qc.setQueryData(ticketKey, context.previous);
      failAction(err);
    },
  });
}

export function useTicketAction(id: string) {
  const qc = useQueryClient();
  return {
    submit: useTicketMutation(qc, id, () => api.patch(`/tickets/${id}/submit`).then(r => r.data), "تم إرسال التذكرة"),
    approve: useTicketMutation(qc, id, (data: Record<string, unknown>) => api.patch(`/tickets/${id}/approve`, data).then(r => r.data), "تم اتخاذ القرار"),
    assign: useTicketMutation(qc, id, (data: Record<string, unknown>) => api.patch(`/tickets/${id}/assign`, data).then(r => r.data), "تمت الجدولة"),
    updatePlan: useTicketMutation(
      qc,
      id,
      (data: Record<string, unknown>) => api.patch(`/tickets/${id}/plan`, data).then(r => r.data),
      "تم حفظ الخطة",
      [],
      { silentSuccess: true, optimistic: true, inlineEdit: true },
    ),
    startWork: useTicketMutation(qc, id, () => api.patch(`/tickets/${id}/start`).then(r => r.data), "بدأ العمل"),
    submitForTesting: useTicketMutation(qc, id, () => api.patch(`/tickets/${id}/submit-for-testing`).then(r => r.data), "جاهز للاختبار"),
    approveCompletion: useTicketMutation(qc, id, () => api.patch(`/tickets/${id}/approve-completion`).then(r => r.data), "تم الاعتماد"),
    close: useTicketMutation(qc, id, (data: Record<string, unknown>) => api.patch(`/tickets/${id}/close`, data).then(r => r.data), "تم الإغلاق"),
    archive: useTicketMutation(qc, id, () => api.patch(`/tickets/${id}/archive`).then(r => r.data), "تم الأرشفة"),
    unarchive: useTicketMutation(qc, id, () => api.patch(`/tickets/${id}/unarchive`).then(r => r.data), "تم إلغاء الأرشفة"),
    reopen: useTicketMutation(qc, id, () => api.patch(`/tickets/${id}/reopen`).then(r => r.data), "تمت إعادة الفتح"),
    forceStatus: useTicketMutation(qc, id, (data: { status: string; reason?: string }) => api.patch(`/tickets/${id}/force-status`, data).then(r => r.data), "تم تغيير الحالة"),

    // Stopping and restarting. All three land on the ticket row, so they reuse
    // the same cache-merge path as every other transition.
    block: useTicketMutation(qc, id, (data: { reason: string; blockedByTicketId?: string }) => api.patch(`/tickets/${id}/block`, data).then(r => r.data), "تم إيقاف التذكرة"),
    hold: useTicketMutation(qc, id, (data: { reason: string }) => api.patch(`/tickets/${id}/hold`, data).then(r => r.data), "تم تعليق التذكرة"),
    resume: useTicketMutation(qc, id, (data: { reason?: string } | undefined) => api.patch(`/tickets/${id}/resume`, data ?? {}).then(r => r.data), "تم استئناف العمل"),
  };
}

/* ── Roster ────────────────────────────────────────────────────────────────
   These return the roster rather than the ticket, so they refetch the detail
   instead of merging their result into it. */

function useRosterMutation<T>(
  qc: QueryClient,
  id: string,
  mutationFn: (vars: T) => Promise<unknown>,
  successMessage: string,
) {
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // Prefix, not exact: the detail *and* every sub-resource of this ticket.
      qc.invalidateQueries({ queryKey: qk.ticket.detail(id) });
      qc.invalidateQueries({ queryKey: qk.tickets.all });
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      toast.success(successMessage);
    },
    onError: failAction,
  });
}

export function useTicketAssignees(id: string) {
  return useQuery({
    queryKey: qk.ticket.assignees(id),
    queryFn: () => api.get(`/tickets/${id}/assignees`).then(r => r.data),
    enabled: !!id,
  });
}

export function useAssigneeActions(id: string) {
  const qc = useQueryClient();
  return {
    add: useRosterMutation(qc, id, (developerId: string) => api.post(`/tickets/${id}/assignees`, { developerId }).then(r => r.data), "تمت إضافة المطور"),
    remove: useRosterMutation(qc, id, (developerId: string) => api.delete(`/tickets/${id}/assignees/${developerId}`).then(r => r.data), "تمت إزالة المطور"),
    setLead: useRosterMutation(qc, id, (developerId: string) => api.patch(`/tickets/${id}/lead`, { developerId }).then(r => r.data), "تم تعيين قائد العمل"),
  };
}

export function useTicketTimeline(id: string) {
  return useQuery({
    queryKey: qk.ticket.timeline(id),
    queryFn: () => api.get(`/tickets/${id}/timeline`).then(r => r.data),
    enabled: !!id,
  });
}

/* ── Prerequisites ─────────────────────────────────────────────────────────*/

export function useTicketDependencies(id: string) {
  return useQuery({
    queryKey: qk.ticket.dependencies(id),
    queryFn: () => api.get(`/tickets/${id}/dependencies`).then(r => r.data),
    enabled: !!id,
  });
}

export function useDependencyActions(id: string) {
  const qc = useQueryClient();
  const settle = () => {
    // A relation is written on both sides, so the ticket at the other end has to
    // drop its cached prerequisite list too — hence the whole `ticket` family.
    qc.invalidateQueries({ queryKey: qk.ticket.all });
    qc.invalidateQueries({ queryKey: qk.tickets.all });
  };
  return {
    add: useMutation({
      mutationFn: (vars: { otherTicketId: string; direction?: string; type?: string }) =>
        api.post(`/tickets/${id}/dependencies`, vars).then(r => r.data),
      onSuccess: () => { settle(); toast.success("تمت إضافة العلاقة"); },
      onError: failDependencyAction,
    }),
    remove: useMutation({
      mutationFn: (otherTicketId: string) =>
        api.delete(`/tickets/${id}/dependencies/${otherTicketId}`).then(r => r.data),
      onSuccess: () => { settle(); toast.success("تمت إزالة العلاقة"); },
      onError: failAction,
    }),
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
