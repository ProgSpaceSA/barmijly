"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { useMeetingActions } from "@/hooks/useMeetings";
import { MEETING_LABELS, MEETING_TYPE_LABELS } from "@/lib/constants";
import { DialogActions, Field, MeetingDialogShell } from "./MeetingDialogShell";

const TYPE_OPTIONS = Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function asList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

/**
 * Scheduling a meeting: a title, the company it belongs to, and when.
 *
 * The company is asked for first because it is what decides who can open the
 * meeting at all — the same question a new ticket asks, for the same reason.
 * Systems are optional here; they are edited on the meeting page once the
 * discussion has a shape.
 */
export function MeetingEditorDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const actions = useMeetingActions();
  const [form, setForm] = useState({
    title: "",
    description: "",
    companyId: "",
    type: "FOLLOW_UP",
    heldAt: "",
    durationMins: "",
    location: "",
  });

  const { data: companiesRaw } = useQuery({
    queryKey: qk.companies.list(),
    queryFn: () => api.get("/companies").then((r) => r.data),
    staleTime: 60_000,
  });
  const companies = asList<{ id: string; name: string }>(companiesRaw);

  const ready = Boolean(form.title.trim() && form.companyId);
  const pending = actions.create.isPending;

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!ready || pending) return;
    const duration = Number.parseInt(form.durationMins, 10);
    const meeting = await actions.create.mutateAsync({
      title: form.title.trim(),
      companyId: form.companyId,
      type: form.type,
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      // `datetime-local` has no zone; the browser's own offset is the intent.
      ...(form.heldAt ? { heldAt: new Date(form.heldAt).toISOString() } : {}),
      ...(Number.isFinite(duration) && duration > 0 ? { durationMins: duration } : {}),
      ...(form.location.trim() ? { location: form.location.trim() } : {}),
    });
    onClose();
    // Straight into the minutes: an empty meeting is not the destination.
    router.push(`/meetings/${meeting.id}`);
  };

  return (
    <MeetingDialogShell
      title={MEETING_LABELS.newMeeting}
      icon={CalendarDays}
      pending={pending}
      onClose={onClose}
      footer={
        <DialogActions
          confirmLabel={MEETING_LABELS.save}
          pendingLabel={MEETING_LABELS.saving}
          pending={pending}
          disabled={!ready}
          onConfirm={submit}
          onClose={onClose}
        />
      }
    >
      <Field label={MEETING_LABELS.title}>
        <Input
          value={form.title}
          aria-label={MEETING_LABELS.title}
          onChange={(e) => set("title", e.target.value)}
          className="h-9 text-sm"
          disabled={pending}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={MEETING_LABELS.company}>
          <ThemeSelect
            value={form.companyId}
            onChange={(value) => set("companyId", value)}
            placeholder={MEETING_LABELS.filterCompany}
            aria-label={MEETING_LABELS.company}
            triggerClassName="h-9"
            disabled={pending}
            items={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>

        <Field label={MEETING_LABELS.type}>
          <ThemeSelect
            value={form.type}
            onChange={(value) => set("type", value || "FOLLOW_UP")}
            placeholder={MEETING_LABELS.filterType}
            aria-label={MEETING_LABELS.type}
            triggerClassName="h-9"
            disabled={pending}
            items={TYPE_OPTIONS}
          />
        </Field>

        <Field label={MEETING_LABELS.heldAt}>
          <Input
            type="datetime-local"
            value={form.heldAt}
            aria-label={MEETING_LABELS.heldAt}
            onChange={(e) => set("heldAt", e.target.value)}
            className="h-9 text-sm"
            disabled={pending}
          />
        </Field>

        <Field label={MEETING_LABELS.duration}>
          <Input
            type="number"
            min={1}
            max={1440}
            inputMode="numeric"
            value={form.durationMins}
            aria-label={MEETING_LABELS.duration}
            onChange={(e) => set("durationMins", e.target.value)}
            className="h-9 text-sm"
            disabled={pending}
          />
        </Field>
      </div>

      <Field label={MEETING_LABELS.location}>
        <Input
          value={form.location}
          aria-label={MEETING_LABELS.location}
          onChange={(e) => set("location", e.target.value)}
          className="h-9 text-sm"
          disabled={pending}
        />
      </Field>

      <Field label={MEETING_LABELS.agenda}>
        <Textarea
          value={form.description}
          aria-label={MEETING_LABELS.agenda}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className="text-sm"
          disabled={pending}
        />
      </Field>
    </MeetingDialogShell>
  );
}
