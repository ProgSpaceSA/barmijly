"use client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { MEETING_LABELS } from "@/lib/constants";

/** Shared error toast — the API's Arabic message wins when it sends one. */
export function failMeeting(error: unknown) {
  const data =
    error && typeof error === "object" && "response" in error
      ? (error as { response?: { data?: { message?: string | string[] } } }).response?.data
      : undefined;
  const raw = data?.message;
  toast.error((Array.isArray(raw) ? raw[0] : raw) || "حدث خطأ");
}

/**
 * A meeting write moves more than the meeting: capturing a line creates a
 * requirement that has to appear on the backlog straight away, and the sidebar
 * badge counts open requirements. Settling both families here is what keeps a
 * captured line from showing an empty chip until the reader reloads.
 */
async function settleMeetingWrite(qc: QueryClient, meetingId?: string) {
  if (meetingId) await qc.refetchQueries({ queryKey: qk.meetings.detail(meetingId) });
  qc.invalidateQueries({ queryKey: qk.meetings.all });
}

export function useMeetings(filters: Record<string, string> = {}) {
  return useQuery({
    queryKey: qk.meetings.list(filters),
    queryFn: () => api.get("/meetings", { params: filters }).then((r) => r.data),
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: qk.meetings.detail(id),
    queryFn: () => api.get(`/meetings/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

type MeetingRow = { id: string };

/**
 * Every write on one meeting. `id` is optional so the list page can use the
 * same hook for «اجتماع جديد» without a meeting to point at yet.
 */
export function useMeetingActions(meetingId?: string) {
  const qc = useQueryClient();

  const settle = (id?: string) => settleMeetingWrite(qc, id ?? meetingId);

  return {
    create: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        api.post("/meetings", data).then((r) => r.data as MeetingRow),
      onSuccess: async (meeting) => {
        toast.success(MEETING_LABELS.meetingCreated);
        await settle(meeting.id);
      },
      onError: failMeeting,
    }),

    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.patch(`/meetings/${id}`, data).then((r) => r.data),
      onSuccess: async (meeting: MeetingRow) => {
        toast.success(MEETING_LABELS.meetingUpdated);
        await settle(meeting.id);
      },
      onError: failMeeting,
    }),

    hold: useMutation({
      mutationFn: (id: string) => api.post(`/meetings/${id}/hold`).then((r) => r.data),
      onSuccess: async (_data, id) => {
        toast.success(MEETING_LABELS.meetingHeld);
        await settle(id);
      },
      onError: failMeeting,
    }),

    cancel: useMutation({
      mutationFn: (id: string) => api.post(`/meetings/${id}/cancel`).then((r) => r.data),
      onSuccess: async (_data, id) => {
        toast.success(MEETING_LABELS.meetingCancelled);
        await settle(id);
      },
      onError: failMeeting,
    }),

    archive: useMutation({
      mutationFn: (id: string) => api.post(`/meetings/${id}/archive`).then((r) => r.data),
      onSuccess: async (_data, id) => {
        toast.success(MEETING_LABELS.meetingArchived);
        await settle(id);
      },
      onError: failMeeting,
    }),

    unarchive: useMutation({
      mutationFn: (id: string) => api.post(`/meetings/${id}/unarchive`).then((r) => r.data),
      onSuccess: async (_data, id) => {
        toast.success(MEETING_LABELS.meetingUnarchived);
        await settle(id);
      },
      onError: failMeeting,
    }),

    addAttendee: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.post(`/meetings/${id}/attendees`, data).then((r) => r.data),
      onSuccess: async (_data, vars) => {
        toast.success(MEETING_LABELS.attendeeAdded);
        await settle(vars.id);
      },
      onError: failMeeting,
    }),

    removeAttendee: useMutation({
      mutationFn: ({ id, attendeeId }: { id: string; attendeeId: string }) =>
        api.delete(`/meetings/${id}/attendees/${attendeeId}`).then((r) => r.data),
      onSuccess: async (_data, vars) => {
        toast.success(MEETING_LABELS.attendeeRemoved);
        await settle(vars.id);
      },
      onError: failMeeting,
    }),

    setSystems: useMutation({
      mutationFn: ({ id, systemIds }: { id: string; systemIds: string[] }) =>
        api.put(`/meetings/${id}/systems`, { systemIds }).then((r) => r.data),
      onSuccess: async (_data, vars) => {
        toast.success(MEETING_LABELS.systemsSaved);
        await settle(vars.id);
      },
      onError: failMeeting,
    }),

    addPoint: useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        api.post(`/meetings/${id}/points`, data).then((r) => r.data),
      onSuccess: async (_data, vars) => settle(vars.id),
      onError: failMeeting,
    }),

    updatePoint: useMutation({
      mutationFn: ({
        id,
        pointId,
        ...data
      }: { id: string; pointId: string } & Record<string, unknown>) =>
        api.patch(`/meetings/${id}/points/${pointId}`, data).then((r) => r.data),
      onSuccess: async (_data, vars) => settle(vars.id),
      onError: failMeeting,
    }),

    reorderPoints: useMutation({
      mutationFn: ({ id, pointId, order }: { id: string; pointId: string; order: number }) =>
        api.post(`/meetings/${id}/points/reorder`, { pointId, order }).then((r) => r.data),
      onSuccess: async (_data, vars) => settle(vars.id),
      onError: failMeeting,
    }),

    removePoint: useMutation({
      mutationFn: ({ id, pointId }: { id: string; pointId: string }) =>
        api.delete(`/meetings/${id}/points/${pointId}`).then((r) => r.data),
      onSuccess: async (_data, vars) => {
        toast.success(MEETING_LABELS.pointRemoved);
        await settle(vars.id);
      },
      onError: failMeeting,
    }),

    capturePoint: useMutation({
      mutationFn: ({
        id,
        pointId,
        ...data
      }: { id: string; pointId: string } & Record<string, unknown>) =>
        api
          .post(`/meetings/${id}/points/${pointId}/capture`, data)
          .then((r) => r.data as { id: string }),
      onSuccess: async (_requirement, vars) => {
        toast.success(MEETING_LABELS.captured);
        await settle(vars.id);
        // The new requirement belongs to the backlog as much as to the minutes.
        qc.invalidateQueries({ queryKey: qk.requirements.all });
      },
      onError: failMeeting,
    }),
  };
}
