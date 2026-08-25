"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { OrderedStepList } from "./OrderedStepList";
import type { TestStep } from "./StepRow";
import { useStepActions } from "@/hooks/useTestCases";
import { deleteAttachment, uploadAttachment } from "@/lib/attachments";
import { TESTING_LABELS } from "@/lib/constants";

/**
 * `OrderedStepList` wired to the API for one owner.
 *
 * The list itself is deliberately dumb — it takes callbacks — so that the ticket
 * page can render the same steps read-only without pulling in any of these
 * mutations. This is the editing half, and it is the only place that knows a
 * step screenshot uploads with `testStepId`.
 */
export function StepEditor({
  steps,
  owner,
  label,
  readOnly = false,
  minSteps = 0,
  onOpenImage,
  onSavingChange,
}: {
  steps: TestStep[];
  owner: { caseId?: string; bugId?: string; suiteId?: string };
  label?: string;
  readOnly?: boolean;
  minSteps?: number;
  onOpenImage?: (attachmentId: string) => void;
  /** Lets the case chrome show «جارٍ الحفظ...» while a step write is in flight. */
  onSavingChange?: (saving: boolean) => void;
}) {
  const actions = useStepActions(owner);
  const [busy, setBusy] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const uploading = uploadPercent !== null;
  const saving =
    busy ||
    uploading ||
    actions.add.isPending ||
    actions.update.isPending ||
    actions.reorder.isPending ||
    actions.remove.isPending;

  useEffect(() => {
    onSavingChange?.(saving);
    return () => onSavingChange?.(false);
  }, [saving, onSavingChange]);

  const attach = async (stepId: string, file: File) => {
    setBusy(true);
    setUploadPercent(0);
    try {
      await uploadAttachment(
        file,
        { testStepId: stepId },
        { onUploadProgress: setUploadPercent },
      );
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || TESTING_LABELS.uploadFailed);
    } finally {
      setBusy(false);
      setUploadPercent(null);
      actions.refresh();
    }
  };

  const detach = async (attachmentId: string) => {
    setBusy(true);
    try {
      await deleteAttachment(attachmentId);
    } catch {
      toast.error(TESTING_LABELS.detachFailed);
    } finally {
      setBusy(false);
      actions.refresh();
    }
  };

  const remove = (id: string) => {
    const step = steps.find((s) => s.id === id);
    if (step?.attachments?.length) {
      setPendingDeleteId(id);
      return;
    }
    actions.remove.mutate(id);
  };

  return (
    <div aria-busy={busy || uploading || undefined}>
      {uploading && (
        <p className="mb-2 text-xs font-medium" style={{ color: "#4F46E5" }} role="status">
          {TESTING_LABELS.uploadingPercent(uploadPercent ?? 0)}
        </p>
      )}
      <OrderedStepList
        steps={steps}
        label={label}
        readOnly={readOnly || uploading}
        minSteps={minSteps}
        onAdd={() => actions.add.mutate("")}
        onBodyChange={(id, body) => actions.update.mutate({ id, body })}
        onReorder={(id, order) => actions.reorder.mutate({ id, order })}
        onDelete={remove}
        onAttach={attach}
        onDetach={detach}
        onOpenImage={onOpenImage}
      />

      {pendingDeleteId && (
        <ConfirmDialog
          title={TESTING_LABELS.deleteTitle}
          message={TESTING_LABELS.deleteStepConfirm}
          actionLabel={TESTING_LABELS.delete}
          pending={actions.remove.isPending}
          danger
          onClose={() => setPendingDeleteId(null)}
          onConfirm={() =>
            actions.remove.mutate(pendingDeleteId, {
              onSuccess: () => setPendingDeleteId(null),
            })
          }
        />
      )}
    </div>
  );
}
