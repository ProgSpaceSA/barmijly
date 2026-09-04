"use client";
import { useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DialogActions, Field, MeetingDialogShell } from "@/components/meetings/MeetingDialogShell";
import { useGuideActions, type HubGuide } from "@/hooks/useGuides";
import { HUB_LABELS } from "@/lib/constants";

/**
 * Add or edit a workflow section. Steps are numbered rows — same shape the
 * LTR preview shows, so managers are not editing a free-text blob.
 */
export function GuideEditorDialog({
  guide,
  onClose,
}: {
  guide?: HubGuide;
  onClose: () => void;
}) {
  const actions = useGuideActions();
  const editing = !!guide;

  const [title, setTitle] = useState(guide?.title ?? "");
  const [summary, setSummary] = useState(guide?.summary ?? "");
  const [steps, setSteps] = useState<string[]>(
    guide?.steps?.length ? [...guide.steps] : [""],
  );

  const pending = actions.create.isPending || actions.update.isPending;
  const cleaned = steps.map((s) => s.trim()).filter(Boolean);
  const ready = Boolean(title.trim() && summary.trim() && cleaned.length);

  const setStep = (index: number, value: string) =>
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));

  const addStep = () => setSteps((prev) => [...prev, ""]);

  const removeStep = (index: number) =>
    setSteps((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));

  const submit = async () => {
    if (!ready || pending) return;
    const payload = {
      title: title.trim(),
      summary: summary.trim(),
      steps: cleaned,
    };
    if (editing) await actions.update.mutateAsync({ id: guide.id, ...payload });
    else await actions.create.mutateAsync(payload);
    onClose();
  };

  return (
    <MeetingDialogShell
      title={editing ? HUB_LABELS.editGuide : HUB_LABELS.newGuide}
      icon={BookOpen}
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
      <Field label={HUB_LABELS.guideTitle}>
        <Input
          value={title}
          aria-label={HUB_LABELS.guideTitle}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 text-sm"
          disabled={pending}
        />
      </Field>
      <Field label={HUB_LABELS.guideSummary}>
        <Input
          value={summary}
          aria-label={HUB_LABELS.guideSummary}
          onChange={(e) => setSummary(e.target.value)}
          className="h-9 text-sm"
          disabled={pending}
        />
      </Field>
      <Field label={HUB_LABELS.guideSteps} hint={HUB_LABELS.guideStepsHint}>
        <div className="flex flex-col gap-2" role="list" aria-label={HUB_LABELS.guideSteps}>
          {steps.map((step, index) => (
            <div key={index} className="flex items-center gap-2" role="listitem">
              <span
                className="font-brm inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums"
                style={{
                  background: "rgba(79,70,229,0.12)",
                  color: "#818CF8",
                  border: "1px solid rgba(79,70,229,0.25)",
                }}
                aria-hidden
              >
                {index + 1}
              </span>
              <Input
                value={step}
                aria-label={`${HUB_LABELS.guideStepN} ${index + 1}`}
                onChange={(e) => setStep(index, e.target.value)}
                className="h-8 flex-1 text-sm"
                disabled={pending}
              />
              <button
                type="button"
                aria-label={HUB_LABELS.removeGuideStep}
                disabled={pending || steps.length <= 1}
                onClick={() => removeStep(index)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
                style={{ border: "1px solid var(--border)", color: "#EF4444" }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addStep}
            disabled={pending}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold disabled:opacity-60"
            style={{
              border: "1px dashed var(--border)",
              color: "var(--muted-foreground)",
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {HUB_LABELS.addGuideStep}
          </button>
        </div>
      </Field>
    </MeetingDialogShell>
  );
}
