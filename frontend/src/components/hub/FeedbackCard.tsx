"use client";
import { useState } from "react";
import { ChevronDown, MessageSquareWarning } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { DialogActions, Field, MeetingDialogShell } from "@/components/meetings/MeetingDialogShell";
import { useAuthStore } from "@/store/auth";
import {
  FEEDBACK_KIND_COLORS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_STATUS_COLORS,
  FEEDBACK_STATUS_LABELS,
  HUB_LABELS,
} from "@/lib/constants";
import type { Feedback, FeedbackStatus } from "@/hooks/useFeedback";

function personName(person?: { firstName: string; lastName: string } | null) {
  if (!person) return "";
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

const STATUS_OPTIONS = Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * One complaint / improvement / inquiry as a short row. Details stay folded.
 */
export function FeedbackCard({
  row,
  people,
  canTriage,
  pending = false,
  onUpdate,
}: {
  row: Feedback;
  people: { value: string; label: string }[];
  canTriage: boolean;
  pending?: boolean;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
}) {
  const me = useAuthStore((s) => s.user?.id);
  const [open, setOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<FeedbackStatus | null>(null);
  const [note, setNote] = useState("");

  const canAct = canTriage || row.assigneeId === me;

  const changeStatus = (status: string) => {
    if (!status || status === row.status) return;
    if (status === "RESOLVED" || status === "CLOSED") {
      setNote(row.resolutionNote ?? "");
      setNoteFor(status as FeedbackStatus);
      return;
    }
    onUpdate(row.id, { status });
  };

  const confirmNote = () => {
    if (!noteFor) return;
    onUpdate(row.id, {
      status: noteFor,
      ...(note.trim() ? { resolutionNote: note.trim() } : {}),
    });
    setNoteFor(null);
  };

  return (
    <article
      className="rounded-xl px-3 py-2.5 sm:px-4"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold ${
                FEEDBACK_KIND_COLORS[row.kind] ?? ""
              }`}
            >
              {FEEDBACK_KIND_LABELS[row.kind] ?? row.kind}
            </span>
            <h3 className="truncate text-sm font-bold" style={{ color: "var(--foreground)" }}>
              {row.title}
            </h3>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold ${
                FEEDBACK_STATUS_COLORS[row.status] ?? ""
              }`}
            >
              {FEEDBACK_STATUS_LABELS[row.status] ?? row.status}
            </span>
          </div>

          <p className="mt-1 line-clamp-1 text-sm" style={{ color: "var(--foreground)" }}>
            {row.body}
          </p>

          <p
            className="font-brm mt-1 text-[0.7rem]"
            style={{ color: "var(--muted-foreground)", opacity: 0.75 }}
          >
            {HUB_LABELS.submittedBy}: {personName(row.createdBy)}
            {" · "}
            {HUB_LABELS.assignedTo}: {row.assignee ? personName(row.assignee) : HUB_LABELS.unassigned}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1.5 inline-flex items-center gap-1 text-[0.7rem] font-semibold"
        style={{ color: "var(--muted-foreground)" }}
        aria-expanded={open}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        {open ? HUB_LABELS.hideDetails : HUB_LABELS.showDetails}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            {row.body}
          </p>
          {row.proposedSolution && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              <span className="font-semibold">{HUB_LABELS.proposedSolution}: </span>
              {row.proposedSolution}
            </p>
          )}
          {row.resolutionNote && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              <span className="font-semibold">{HUB_LABELS.resolutionNote}: </span>
              {row.resolutionNote}
            </p>
          )}

          {canAct && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ThemeSelect
                value={row.status}
                onChange={changeStatus}
                placeholder={HUB_LABELS.filterStatus}
                aria-label={HUB_LABELS.filterStatus}
                triggerClassName="h-9"
                items={STATUS_OPTIONS}
                disabled={pending}
              />
              {canTriage && (
                <ThemeSelect
                  value={row.assigneeId ?? "__general__"}
                  onChange={(v) =>
                    onUpdate(row.id, { assigneeId: v === "__general__" || !v ? null : v })
                  }
                  placeholder={HUB_LABELS.feedbackAssignee}
                  aria-label={HUB_LABELS.feedbackAssignee}
                  triggerClassName="h-9"
                  items={[{ value: "__general__", label: HUB_LABELS.unassigned }, ...people]}
                  disabled={pending}
                />
              )}
            </div>
          )}
        </div>
      )}

      {noteFor && (
        <MeetingDialogShell
          title={FEEDBACK_STATUS_LABELS[noteFor]}
          icon={MessageSquareWarning}
          pending={pending}
          onClose={() => setNoteFor(null)}
          footer={
            <DialogActions
              confirmLabel={HUB_LABELS.save}
              pendingLabel={HUB_LABELS.saving}
              pending={pending}
              onConfirm={confirmNote}
              onClose={() => setNoteFor(null)}
            />
          }
        >
          <Field label={`${HUB_LABELS.resolutionNote} (${HUB_LABELS.optional})`} hint={HUB_LABELS.resolutionNoteHint}>
            <Textarea
              value={note}
              aria-label={HUB_LABELS.resolutionNote}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="text-sm"
              disabled={pending}
            />
          </Field>
        </MeetingDialogShell>
      )}
    </article>
  );
}
