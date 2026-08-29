"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { useRequirementActions } from "@/hooks/useRequirements";
import {
  MEETING_LABELS,
  PRIORITY_LABELS,
  REQUIREMENT_SOURCE_LABELS,
} from "@/lib/constants";
import { DialogActions, Field, MeetingDialogShell } from "./MeetingDialogShell";

/**
 * `MEETING` is missing on purpose: an ask made in a meeting is captured off its
 * minutes line, which is what gives it a point to link back to. Offering it
 * here would let somebody file a meeting requirement with no meeting.
 */
const SOURCE_OPTIONS = Object.entries(REQUIREMENT_SOURCE_LABELS)
  .filter(([value]) => value !== "MEETING")
  .map(([value, label]) => ({ value, label }));

const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
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

/** Filing an ask that arrived outside a meeting — WhatsApp, email, a call. */
export function RequirementEditorDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const actions = useRequirementActions();
  const [form, setForm] = useState({
    title: "",
    description: "",
    companyId: "",
    systemId: "",
    source: "WHATSAPP",
    sourceNote: "",
    requestedByName: "",
    priority: "",
    dueDate: "",
  });

  const { data: companiesRaw } = useQuery({
    queryKey: qk.companies.list(),
    queryFn: () => api.get("/companies").then((r) => r.data),
    staleTime: 60_000,
  });
  const companies = asList<{ id: string; name: string }>(companiesRaw);

  const { data: systemsRaw } = useQuery({
    queryKey: qk.systems.byCompany(form.companyId),
    queryFn: () => api.get(`/systems?companyId=${form.companyId}`).then((r) => r.data),
    enabled: !!form.companyId,
    staleTime: 60_000,
  });
  const systems = asList<{ id: string; name: string }>(systemsRaw);

  const ready = Boolean(form.title.trim() && form.companyId);
  const pending = actions.create.isPending;

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({
      ...prev,
      [key]: value,
      // A system belongs to a company; changing the company drops the stale pick.
      ...(key === "companyId" ? { systemId: "" } : {}),
    }));

  const submit = async () => {
    if (!ready || pending) return;
    const requirement = await actions.create.mutateAsync({
      title: form.title.trim(),
      companyId: form.companyId,
      source: form.source,
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.sourceNote.trim() ? { sourceNote: form.sourceNote.trim() } : {}),
      ...(form.requestedByName.trim() ? { requestedByName: form.requestedByName.trim() } : {}),
      ...(form.systemId ? { systemId: form.systemId } : {}),
      ...(form.priority ? { priority: form.priority } : {}),
      ...(form.dueDate ? { dueDate: new Date(form.dueDate).toISOString() } : {}),
    });
    onClose();
    router.push(`/requirements/${requirement.id}`);
  };

  return (
    <MeetingDialogShell
      title={MEETING_LABELS.newRequirement}
      icon={ClipboardList}
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
      <Field label={MEETING_LABELS.requirementTitle}>
        <Input
          value={form.title}
          aria-label={MEETING_LABELS.requirementTitle}
          onChange={(e) => set("title", e.target.value)}
          className="h-9 text-sm"
          disabled={pending}
        />
      </Field>

      <Field label={MEETING_LABELS.requirementDescription}>
        <Textarea
          value={form.description}
          aria-label={MEETING_LABELS.requirementDescription}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className="text-sm"
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

        <Field label={MEETING_LABELS.system} hint={MEETING_LABELS.promoteNeedsSystem}>
          <ThemeSelect
            value={form.systemId}
            onChange={(value) => set("systemId", value)}
            placeholder={form.companyId ? MEETING_LABELS.unpinned : MEETING_LABELS.filterCompany}
            aria-label={MEETING_LABELS.system}
            triggerClassName="h-9"
            disabled={pending || !form.companyId}
            items={systems.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>

        <Field label={MEETING_LABELS.source}>
          <ThemeSelect
            value={form.source}
            onChange={(value) => set("source", value || "OTHER")}
            placeholder={MEETING_LABELS.filterSource}
            aria-label={MEETING_LABELS.source}
            triggerClassName="h-9"
            disabled={pending}
            items={SOURCE_OPTIONS}
          />
        </Field>

        <Field label={MEETING_LABELS.sourceNote} hint={MEETING_LABELS.sourceNoteHint}>
          <Input
            value={form.sourceNote}
            aria-label={MEETING_LABELS.sourceNote}
            onChange={(e) => set("sourceNote", e.target.value)}
            className="h-9 text-sm"
            disabled={pending}
          />
        </Field>

        <Field label={MEETING_LABELS.requestedByName}>
          <Input
            value={form.requestedByName}
            aria-label={MEETING_LABELS.requestedByName}
            onChange={(e) => set("requestedByName", e.target.value)}
            className="h-9 text-sm"
            disabled={pending}
          />
        </Field>

        <Field label={MEETING_LABELS.priority}>
          <ThemeSelect
            value={form.priority}
            onChange={(value) => set("priority", value)}
            placeholder={MEETING_LABELS.optional}
            aria-label={MEETING_LABELS.priority}
            triggerClassName="h-9"
            disabled={pending}
            items={PRIORITY_OPTIONS}
          />
        </Field>

        <Field label={MEETING_LABELS.dueDate}>
          <Input
            type="date"
            value={form.dueDate}
            aria-label={MEETING_LABELS.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
            className="h-9 text-sm"
            disabled={pending}
          />
        </Field>
      </div>
    </MeetingDialogShell>
  );
}
