"use client";
import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink, GripVertical, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { MEETING_LABELS, POINT_KIND_LABELS } from "@/lib/constants";
import { formatRequirementCode } from "@/lib/utils";
import { PointKindBadge } from "./MeetingBadges";

export type MeetingPoint = {
  id: string;
  order: number;
  kind: string;
  body: string;
  raisedBy?: { id: string; firstName?: string; lastName?: string } | null;
  raisedByName?: string | null;
  requirements?: {
    id: string;
    requirementNumber?: number | null;
    title?: string;
    status?: string;
  }[];
};

const KIND_OPTIONS = Object.entries(POINT_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const SAVE_DELAY_MS = 600;

/**
 * One numbered line of the minutes: grip, number, kind, text, capture, delete.
 *
 * The text debounces the same way a test step does — minutes are typed live
 * during a meeting, and a PATCH per keystroke would make the list fight the
 * typist. Captured requirements show as chips on the row rather than as a
 * status on the point: the point stays a record of what was said, and the
 * requirement is the thing that gets chased.
 */
export function PointRow({
  point,
  index,
  readOnly = false,
  canCapture = false,
  capturing = false,
  onBodyChange,
  onKindChange,
  onDelete,
  onCapture,
  onDebouncingChange,
}: {
  point: MeetingPoint;
  index: number;
  readOnly?: boolean;
  canCapture?: boolean;
  capturing?: boolean;
  onBodyChange?: (id: string, body: string) => void;
  onKindChange?: (id: string, kind: string) => void;
  onDelete?: (id: string) => void;
  onCapture?: (point: MeetingPoint) => void;
  /** True while a debounced body save is waiting to fire. */
  onDebouncingChange?: (debouncing: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: point.id,
    disabled: readOnly,
  });

  const [draft, setDraft] = useState(point.body);
  const draftRef = useRef(draft);
  const bodyRef = useRef(point.body);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    draftRef.current = draft;
  });

  useEffect(() => {
    bodyRef.current = point.body;
  }, [point.body]);

  // Server wins whenever the row is not mid-edit; a pending debounce keeps the
  // typist's text on screen until it lands.
  useEffect(() => {
    if (dirtyRef.current) {
      if (draftRef.current === point.body) dirtyRef.current = false;
      else return;
    }
    if (debounceRef.current) return;
    setDraft(point.body);
    requestAnimationFrame(resizeTextarea);
  }, [point.body]);

  const flush = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onDebouncingChange?.(false);
    const next = draftRef.current;
    if (next.trim() && next !== bodyRef.current) onBodyChange?.(point.id, next);
    dirtyRef.current = false;
  };

  // Flush on unmount — clearing the timer alone drops the last keystrokes.
  useEffect(
    () => () => {
      if (!debounceRef.current) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const next = draftRef.current;
      if (next.trim() && next !== bodyRef.current) onBodyChange?.(point.id, next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const scheduleSave = (value: string) => {
    dirtyRef.current = true;
    draftRef.current = value;
    setDraft(value);
    requestAnimationFrame(resizeTextarea);
    onDebouncingChange?.(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const raiser =
    [point.raisedBy?.firstName, point.raisedBy?.lastName].filter(Boolean).join(" ") ||
    point.raisedByName ||
    "";
  const captured = point.requirements ?? [];
  const blank = !point.body.trim();
  const pointLabel = `${MEETING_LABELS.pointLine} ${index + 1}`;

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
          aria-label={MEETING_LABELS.dragPoint}
          title={MEETING_LABELS.dragPoint}
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
          <div className="py-2">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <PointKindBadge kind={point.kind} />
              {raiser && (
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {MEETING_LABELS.raisedBy}: {raiser}
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
              {point.body}
            </p>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5 py-1">
            <ThemeSelect
              value={point.kind}
              onChange={(value) => value && onKindChange?.(point.id, value)}
              placeholder={MEETING_LABELS.pointKind}
              aria-label={`${MEETING_LABELS.pointKind} ${index + 1}`}
              triggerClassName="h-8 w-full sm:w-32 shrink-0"
              items={KIND_OPTIONS}
            />
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              aria-label={pointLabel}
              placeholder={MEETING_LABELS.pointPlaceholder}
              className="brm-step-textarea w-full min-w-0 flex-1 border border-border bg-muted px-3 text-sm text-foreground outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/30"
              onChange={(e) => scheduleSave(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (debounceRef.current) {
                    clearTimeout(debounceRef.current);
                    debounceRef.current = null;
                  }
                  onDebouncingChange?.(false);
                  dirtyRef.current = false;
                  setDraft(point.body);
                  draftRef.current = point.body;
                  requestAnimationFrame(resizeTextarea);
                }
              }}
            />
            {canCapture && (
              <button
                type="button"
                className="brm-step-btn shrink-0"
                aria-label={`${MEETING_LABELS.capture} ${index + 1}`}
                title={MEETING_LABELS.captureHint}
                disabled={capturing || blank}
                onClick={() => onCapture?.(point)}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              className="brm-step-btn shrink-0"
              aria-label={`${MEETING_LABELS.deletePoint} ${index + 1}`}
              title={MEETING_LABELS.deletePoint}
              onClick={() => onDelete?.(point.id)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {(captured.length > 0 || raiser) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!readOnly && raiser && (
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {MEETING_LABELS.raisedBy}: {raiser}
              </span>
            )}
            {captured.map((requirement) => (
              <Link
                key={requirement.id}
                href={`/requirements/${requirement.id}`}
                title={requirement.title ?? MEETING_LABELS.openRequirement}
                className="brm-ticket-link ltr-isolate inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-brm text-[11px] font-semibold"
                style={{
                  background: "rgba(79,70,229,0.12)",
                  border: "1px solid rgba(79,70,229,0.35)",
                }}
              >
                {formatRequirementCode(requirement.requirementNumber) ??
                  MEETING_LABELS.capturedChip}
                <ExternalLink className="h-2.5 w-2.5" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
