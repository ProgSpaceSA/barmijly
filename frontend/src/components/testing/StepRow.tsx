"use client";
import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AttachmentImage } from "@/components/shared/AttachmentImage";
import { TESTING_LABELS } from "@/lib/constants";

export type TestStep = {
  id: string;
  order: number;
  body: string;
  attachments?: { id: string; url: string; fileName: string }[];
  /** Chosen in the compose dialog before the step (and bug) exist on the server. */
  localShot?: { file: File; previewUrl: string; fileName: string };
};

/** Images only for the step slot — the general allow-list stays on case files. */
export const STEP_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,image/*";

const SAVE_DELAY_MS = 600;

/**
 * One step: grip, number, text, screenshot control, delete — all on one row.
 *
 * Screenshot removal uses an image-minus control (not a second ×) so the row
 * keeps a single delete affordance.
 */
export function StepRow({
  step,
  index,
  readOnly = false,
  canDelete = true,
  liveUpdate = false,
  onBodyChange,
  onDelete,
  onAttach,
  onDetach,
  onOpenImage,
  onOpenLocalShot,
}: {
  step: TestStep;
  index: number;
  readOnly?: boolean;
  canDelete?: boolean;
  /** Call `onBodyChange` on every keystroke — used for local draft steps before a bug exists. */
  liveUpdate?: boolean;
  onBodyChange?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
  onAttach?: (id: string, file: File) => void;
  onDetach?: (attachmentId: string, stepId: string) => void;
  onOpenImage?: (attachmentId: string) => void;
  /** Open a blob/object URL for a draft screenshot that is not on the server yet. */
  onOpenLocalShot?: (previewUrl: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
    disabled: readOnly,
  });

  const [draft, setDraft] = useState(step.body);
  const fileInput = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  const bodyRef = useRef(step.body);
  const dirtyRef = useRef(false);
  const onBodyChangeRef = useRef(onBodyChange);
  const stepIdRef = useRef(step.id);

  useEffect(() => {
    draftRef.current = draft;
  });

  useEffect(() => {
    onBodyChangeRef.current = onBodyChange;
    stepIdRef.current = step.id;
  });

  useEffect(() => {
    bodyRef.current = step.body;
  }, [step.body]);

  useEffect(() => {
    if (dirtyRef.current) {
      if (draftRef.current.trim() === step.body) dirtyRef.current = false;
      else return;
    }
    if (debounceRef.current) return;
    setDraft(step.body);
  }, [step.body]);

  const flush = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const next = draftRef.current.trim();
    if (liveUpdate) {
      // Keep dirty until props catch up — clearing early lets the sync effect
      // wipe the input with a still-empty `step.body`.
      if (next !== bodyRef.current) {
        onBodyChangeRef.current?.(stepIdRef.current, draftRef.current);
      }
      return;
    }
    if (next !== bodyRef.current) {
      onBodyChangeRef.current?.(stepIdRef.current, next);
      dirtyRef.current = false;
    } else {
      dirtyRef.current = false;
    }
  };

  // Flush pending edits on unmount — clearing the timer alone drops keystrokes.
  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        const next = draftRef.current.trim();
        if (next !== bodyRef.current) {
          onBodyChangeRef.current?.(stepIdRef.current, next);
        }
      }
    },
    [],
  );

  const shot = step.attachments?.[0];
  const local = step.localShot;
  const hasShot = Boolean(local || shot);
  const stepLabel = `${TESTING_LABELS.steps} ${index + 1}`;

  const scheduleSave = (value: string) => {
    dirtyRef.current = true;
    draftRef.current = value;
    setDraft(value);
    if (liveUpdate) {
      onBodyChangeRef.current?.(stepIdRef.current, value);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const pickFiles = (files: File[]) => {
    if (files[0]) onAttach?.(step.id, files[0]);
  };

  return (
    <div
      ref={setNodeRef}
      className="brm-step-row"
      data-dragging={isDragging ? "true" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {!readOnly && (
        <button
          type="button"
          className="brm-step-btn brm-step-grip"
          aria-label={TESTING_LABELS.dragStep}
          title={TESTING_LABELS.dragStep}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      )}

      <span className="brm-step-order font-brm" aria-hidden>
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        {readOnly ? (
          <p className="py-2 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            {step.body}
          </p>
        ) : (
          <Input
            value={draft}
            aria-label={stepLabel}
            placeholder={TESTING_LABELS.stepPlaceholder}
            className="h-9 text-sm"
            onChange={(e) => scheduleSave(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                flush();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                if (debounceRef.current) {
                  clearTimeout(debounceRef.current);
                  debounceRef.current = null;
                }
                dirtyRef.current = false;
                setDraft(step.body);
                draftRef.current = step.body;
              }
            }}
          />
        )}
      </div>

      {hasShot ? (
        <button
          type="button"
          onClick={() => {
            if (local) onOpenLocalShot?.(local.previewUrl);
            else if (shot) onOpenImage?.(shot.id);
          }}
          className="brm-step-shot brm-step-shot--filled"
          aria-label={local?.fileName ?? shot?.fileName}
          title={local?.fileName ?? shot?.fileName}
        >
          {local ? (
            <img
              src={local.previewUrl}
              alt={local.fileName}
              className="brm-step-thumb"
            />
          ) : (
            <AttachmentImage
              attachmentId={shot!.id}
              alt={shot!.fileName}
              className="brm-step-thumb"
            />
          )}
        </button>
      ) : (
        !readOnly && (
          <>
            <button
              type="button"
              className="brm-step-shot"
              aria-label={TESTING_LABELS.addScreenshot}
              title={TESTING_LABELS.addScreenshot}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus className="h-4 w-4" aria-hidden />
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept={STEP_IMAGE_ACCEPT}
              aria-label={TESTING_LABELS.addScreenshot}
              onChange={(e) => {
                pickFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </>
        )
      )}

      {!readOnly && (
        <button
          type="button"
          className="brm-step-btn"
          aria-label={`${TESTING_LABELS.deleteStep} ${index + 1}`}
          title={TESTING_LABELS.deleteStep}
          disabled={!canDelete}
          onClick={() => onDelete?.(step.id)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
