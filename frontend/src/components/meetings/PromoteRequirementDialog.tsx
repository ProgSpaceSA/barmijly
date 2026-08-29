"use client";
import { useState } from "react";
import { Ticket as TicketIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { MEETING_LABELS, TICKET_TYPE_LABELS } from "@/lib/constants";
import { formatRequirementCode } from "@/lib/utils";
import { DialogActions, Field, MeetingDialogShell } from "./MeetingDialogShell";

const TYPE_OPTIONS = Object.entries(TICKET_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Title and type before promote. The ticket lands at DRAFT whatever is chosen
 * here — this decides how it reads, not whether it needs approval.
 */
export function PromoteRequirementDialog({
  requirement,
  pending = false,
  onClose,
  onConfirm,
}: {
  requirement: { id: string; requirementNumber?: number | null; title: string };
  pending?: boolean;
  onClose: () => void;
  onConfirm: (data: { title: string; type: string }) => void;
}) {
  const [title, setTitle] = useState(
    () => `(${formatRequirementCode(requirement.requirementNumber) ?? "REQ"}) ${requirement.title}`,
  );
  const [type, setType] = useState("NEW_FEATURE");

  const ready = title.trim().length > 0;

  return (
    <MeetingDialogShell
      title={MEETING_LABELS.promoteTitle}
      icon={TicketIcon}
      pending={pending}
      onClose={onClose}
      footer={
        <DialogActions
          confirmLabel={MEETING_LABELS.promoteConfirm}
          pendingLabel={MEETING_LABELS.promoting}
          pending={pending}
          disabled={!ready}
          onConfirm={() => onConfirm({ title: title.trim(), type })}
          onClose={onClose}
        />
      }
    >
      <Field label={MEETING_LABELS.promoteTitleLabel}>
        <Input
          value={title}
          aria-label={MEETING_LABELS.promoteTitleLabel}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 text-sm"
          disabled={pending}
        />
      </Field>

      <Field label={MEETING_LABELS.promoteTypeLabel}>
        <ThemeSelect
          value={type}
          onChange={(value) => setType(value || "NEW_FEATURE")}
          placeholder={MEETING_LABELS.promoteTypeLabel}
          aria-label={MEETING_LABELS.promoteTypeLabel}
          triggerClassName="h-9"
          disabled={pending}
          items={TYPE_OPTIONS}
        />
      </Field>

      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        {MEETING_LABELS.promoteHint}
      </p>
    </MeetingDialogShell>
  );
}
