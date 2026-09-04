"use client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { DialogActions, Field, MeetingDialogShell } from "@/components/meetings/MeetingDialogShell";
import { useFeedbackActions } from "@/hooks/useFeedback";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { FEEDBACK_KIND_LABELS, HUB_LABELS } from "@/lib/constants";

const KIND_OPTIONS = Object.entries(FEEDBACK_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const FEEDBACK_ASSIGNEE_ROLES = new Set([
  "PROGRAMMING_HEAD",
  "PROJECT_MANAGER",
  "SENIOR_MANAGEMENT",
]);

type Person = { id: string; firstName: string; lastName: string; role: string };

function personLabel(person: Person) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

/**
 * File a complaint, improvement, or inquiry. The responsible person is
 * optional — leaving it empty sends the row to leadership as a general ask.
 */
export function FeedbackEditorDialog({ onClose }: { onClose: () => void }) {
  const actions = useFeedbackActions();
  const { data: peopleRaw = [] } = useQuery<Person[]>({
    queryKey: qk.users.mentionable(),
    queryFn: () => api.get("/users/mentionable").then((r) => r.data),
  });

  const people = useMemo(
    () => peopleRaw.filter((person) => FEEDBACK_ASSIGNEE_ROLES.has(person.role)),
    [peopleRaw],
  );

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("IMPROVEMENT");
  const [assigneeId, setAssigneeId] = useState("");
  const [proposedSolution, setProposedSolution] = useState("");

  const pending = actions.create.isPending;
  const ready = Boolean(title.trim() && body.trim() && kind);

  const submit = async () => {
    if (!ready || pending) return;
    await actions.create.mutateAsync({
      title: title.trim(),
      body: body.trim(),
      kind,
      ...(assigneeId ? { assigneeId } : {}),
      ...(proposedSolution.trim() ? { proposedSolution: proposedSolution.trim() } : {}),
    });
    onClose();
  };

  return (
    <MeetingDialogShell
      title={HUB_LABELS.newFeedback}
      icon={MessageSquareWarning}
      pending={pending}
      onClose={onClose}
      footer={
        <DialogActions
          confirmLabel={HUB_LABELS.save}
          pendingLabel={HUB_LABELS.saving}
          pending={pending}
          disabled={!ready}
          onConfirm={submit}
          onClose={onClose}
        />
      }
    >
      <Field label={HUB_LABELS.feedbackTitle} hint={HUB_LABELS.feedbackTitleHint}>
        <Input
          value={title}
          aria-label={HUB_LABELS.feedbackTitle}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 text-sm"
          disabled={pending}
        />
      </Field>

      <Field label={HUB_LABELS.feedbackKind}>
        <ThemeSelect
          value={kind}
          onChange={setKind}
          placeholder={HUB_LABELS.feedbackKind}
          aria-label={HUB_LABELS.feedbackKind}
          triggerClassName="h-9"
          items={KIND_OPTIONS}
          disabled={pending}
        />
      </Field>

      <Field label={HUB_LABELS.feedbackBody} hint={HUB_LABELS.feedbackBodyHint}>
        <Textarea
          value={body}
          aria-label={HUB_LABELS.feedbackBody}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="text-sm"
          disabled={pending}
        />
      </Field>

      <Field
        label={`${HUB_LABELS.feedbackAssignee} (${HUB_LABELS.optional})`}
        hint={HUB_LABELS.unassignedHint}
      >
        <ThemeSelect
          value={assigneeId}
          onChange={setAssigneeId}
          placeholder={HUB_LABELS.unassigned}
          aria-label={HUB_LABELS.feedbackAssignee}
          triggerClassName="h-9"
          items={people.map((person) => ({ value: person.id, label: personLabel(person) }))}
          disabled={pending}
        />
      </Field>

      <Field
        label={`${HUB_LABELS.proposedSolution} (${HUB_LABELS.optional})`}
        hint={HUB_LABELS.proposedSolutionHint}
      >
        <Textarea
          value={proposedSolution}
          aria-label={HUB_LABELS.proposedSolution}
          onChange={(e) => setProposedSolution(e.target.value)}
          rows={2}
          className="text-sm"
          disabled={pending}
        />
      </Field>
    </MeetingDialogShell>
  );
}
