"use client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { MEETING_LABELS } from "@/lib/constants";
import { failMeeting } from "@/hooks/useMeetings";

/**
 * A requirement write can move three families at once: the backlog row, the
 * meeting whose minutes it hangs off, and — on promote — the tickets list the
 * new DRAFT has to appear in. Settling all three here is what keeps the
 * «إنشاء تذكرة» button from leaving a stale chip behind.
 */
async function settleRequirementWrite(
  qc: QueryClient,
  opts: { requirementId?: string; meetingId?: string | null; ticketId?: string | null } = {},
) {
  if (opts.requirementId) {
    await qc.refetchQueries({ queryKey: qk.requirements.detail(opts.requirementId) });
  }
  qc.invalidateQueries({ queryKey: qk.requirements.all });
  if (opts.meetingId) qc.invalidateQueries({ queryKey: qk.meetings.all });
  if (opts.ticketId) qc.invalidateQueries({ queryKey: qk.tickets.all });
}

export function useRequirements(filters: Record<string, string> = {}) {
  return useQuery({
    queryKey: qk.requirements.list(filters),
    queryFn: () => api.get("/requirements", { params: filters }).then((r) => r.data),
  });
}

export function useRequirement(id: string) {
  return useQuery({
    queryKey: qk.requirements.detail(id),
    queryFn: () => api.get(`/requirements/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

/** Open-requirement badge on the sidebar. Same scope as the list it links to. */
export function useOpenRequirementCount(enabled = true) {
  return useQuery({
    queryKey: qk.requirements.openCount(),
    queryFn: () => api.get("/requirements/open-count").then((r) => r.data.count as number),
    staleTime: 60_000,
    enabled,
  });
}

type RequirementRow = {
  id: string;
  description?: string | null;
  meetingPoint?: { meeting?: { id: string } | null } | null;
};

export function useRequirementActions(requirementId?: string) {
  const qc = useQueryClient();

  const settle = (row: RequirementRow | undefined, ticketId?: string | null) =>
    settleRequirementWrite(qc, {
      requirementId: row?.id ?? requirementId,
      meetingId: row?.meetingPoint?.meeting?.id ?? null,
      ticketId,
    });

  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        api.post("/requirements", data).then((r) => r.data as RequirementRow),
      onSuccess: async (requirement) => {
        toast.success(MEETING_LABELS.requirementCreated);
        await settle(requirement);
      },
      onError: failMeeting,
    }),

    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.patch(`/requirements/${id}`, data).then((r) => r.data as RequirementRow),
      onSuccess: async (requirement, variables) => {
        const fields = Object.keys(variables).filter((key) => key !== "id");
        const descriptionOnly = fields.length === 1 && fields[0] === "description";
        if (!descriptionOnly) toast.success(MEETING_LABELS.requirementUpdated);
        qc.setQueryData(qk.requirements.detail(requirement.id), requirement);
        if (descriptionOnly) {
          qc.invalidateQueries({ queryKey: qk.requirements.all });
          return;
        }
        await settle(requirement);
      },
      onError: failMeeting,
    }),

    changeStatus: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.post(`/requirements/${id}/status`, data).then((r) => r.data as RequirementRow),
      onSuccess: async (requirement) => {
        toast.success(MEETING_LABELS.requirementStatusChanged);
        await settle(requirement);
      },
      onError: failMeeting,
    }),

    promote: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api
          .post(`/requirements/${id}/promote`, data)
          .then((r) => r.data as { requirement: RequirementRow; ticket: { id: string } }),
      onSuccess: async (result) => {
        toast.success(MEETING_LABELS.promoted);
        await settle(result.requirement, result.ticket?.id);
      },
      onError: failMeeting,
    }),

    archive: useMutation({
      mutationFn: (id: string) =>
        api.post(`/requirements/${id}/archive`).then((r) => r.data as RequirementRow),
      onSuccess: async (requirement) => {
        toast.success(MEETING_LABELS.requirementArchived);
        await settle(requirement);
      },
      onError: failMeeting,
    }),

    unarchive: useMutation({
      mutationFn: (id: string) =>
        api.post(`/requirements/${id}/unarchive`).then((r) => r.data as RequirementRow),
      onSuccess: async (requirement) => {
        toast.success(MEETING_LABELS.requirementUnarchived);
        await settle(requirement);
      },
      onError: failMeeting,
    }),
  };
}
