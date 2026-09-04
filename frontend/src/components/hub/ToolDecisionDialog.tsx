"use client";
import { useState } from "react";
import { PowerOff, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { DialogActions, Field, MeetingDialogShell } from "@/components/meetings/MeetingDialogShell";
import { HUB_LABELS } from "@/lib/constants";
import type { Tool } from "@/hooks/useTools";

export type ToolDecision = "decline" | "retire";

/**
 * Decline and retire, which are the same act with a different verb: a no that
 * stays on the board with its reason. The note is required rather than
 * optional — a rejected row with no reason is exactly the row that gets
 * re-requested in six months.
 */
export function ToolDecisionDialog({
  tool,
  decision,
  pending = false,
  onConfirm,
  onClose,
}: {
  tool: Tool;
  decision: ToolDecision;
  pending?: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const declining = decision === "decline";

  return (
    <MeetingDialogShell
      title={declining ? HUB_LABELS.declineTitle : HUB_LABELS.retireTitle}
      icon={declining ? X : PowerOff}
      pending={pending}
      onClose={onClose}
      footer={
        <DialogActions
          confirmLabel={declining ? HUB_LABELS.decline : HUB_LABELS.retire}
          pendingLabel={HUB_LABELS.saving}
          pending={pending}
          disabled={!note.trim()}
          onConfirm={() => onConfirm(note.trim())}
          onClose={onClose}
        />
      }
    >
      <p className="text-sm" style={{ color: "var(--foreground)" }}>
        {tool.name}
      </p>

      <Field label={HUB_LABELS.declineNote} hint={HUB_LABELS.declineNoteHint}>
        <Textarea
          value={note}
          aria-label={HUB_LABELS.declineNote}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="text-sm"
          disabled={pending}
        />
      </Field>
    </MeetingDialogShell>
  );
}
