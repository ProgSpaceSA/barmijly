"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { MEETING_LABELS, PRIORITY_LABELS } from "@/lib/constants";
import { DialogActions, Field, MeetingDialogShell } from "./MeetingDialogShell";
import type { MeetingPoint } from "./PointRow";

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

/** A title is one line; the minutes line may be a paragraph. */
function titleFromBody(body: string): string {
  const line = body.trim().split(/\r?\n/)[0].trim();
  return line.length > 200 ? `${line.slice(0, 197)}…` : line;
}

/**
 * Capture: turning one minutes line into a tracked requirement.
 *
 * Everything is pre-filled from the line, so the common case is opening this
 * and pressing capture. The system is offered but not required — pinning it is
 * triage's call, and the requirement is refused for promotion until it happens.
 */
export function CapturePointDialog({
  point,
  companyId,
  pending = false,
  onClose,
  onConfirm,
}: {
  point: MeetingPoint;
  companyId: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    title: titleFromBody(point.body),
    description: point.body,
    systemId: "",
    priority: "",
  });

  const { data: systemsRaw } = useQuery({
    queryKey: qk.systems.byCompany(companyId),
    queryFn: () => api.get(`/systems?companyId=${companyId}`).then((r) => r.data),
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const systems = asList<{ id: string; name: string }>(systemsRaw);

  const ready = form.title.trim().length > 0;
  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <MeetingDialogShell
      title={MEETING_LABELS.captureTitle}
      icon={Sparkles}
      pending={pending}
      onClose={onClose}
      footer={
        <DialogActions
          confirmLabel={MEETING_LABELS.captureConfirm}
          pendingLabel={MEETING_LABELS.saving}
          pending={pending}
          disabled={!ready}
          onConfirm={() =>
            onConfirm({
              title: form.title.trim(),
              description: form.description,
              ...(form.systemId ? { systemId: form.systemId } : {}),
              ...(form.priority ? { priority: form.priority } : {}),
            })
          }
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
          rows={4}
          className="text-sm"
          disabled={pending}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={MEETING_LABELS.system} hint={MEETING_LABELS.promoteNeedsSystem}>
          <ThemeSelect
            value={form.systemId}
            onChange={(value) => set("systemId", value)}
            placeholder={MEETING_LABELS.unpinned}
            aria-label={MEETING_LABELS.system}
            triggerClassName="h-9"
            disabled={pending}
            items={systems.map((s) => ({ value: s.id, label: s.name }))}
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
      </div>

      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        {MEETING_LABELS.captureHint}
      </p>
    </MeetingDialogShell>
  );
}
