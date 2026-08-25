"use client";
import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { StepRow, type TestStep } from "./StepRow";
import { TESTING_LABELS } from "@/lib/constants";

/**
 * The ordered step list — one component, two entry points.
 *
 * A test case's «خطوات التنفيذ» and a bug's «خطوات إعادة الإنتاج» are the same
 * object: a numbered line with an optional screenshot. Rendering them with one
 * pair of components is what keeps the two surfaces from drifting, and it is
 * why the props here are all callbacks — the owner decides what a reorder or an
 * attach actually writes to.
 *
 * Reordering is `@dnd-kit`, which gives the grip a keyboard path for free:
 * focus it, space to lift, arrows to move, space to drop. That matters because
 * drag-only reordering is unreachable for anyone not using a mouse.
 */
export function OrderedStepList({
  steps,
  label,
  readOnly = false,
  minSteps = 0,
  liveUpdate = false,
  onReorder,
  onAdd,
  onDelete,
  onBodyChange,
  onAttach,
  onDetach,
  onOpenImage,
  onOpenLocalShot,
}: {
  steps: TestStep[];
  label?: string;
  readOnly?: boolean;
  /** Below this count the delete button is disabled — publishing needs one step. */
  minSteps?: number;
  liveUpdate?: boolean;
  onReorder?: (id: string, order: number) => void;
  onAdd?: () => void;
  onDelete?: (id: string) => void;
  onBodyChange?: (id: string, body: string) => void;
  onAttach?: (id: string, file: File) => void;
  onDetach?: (attachmentId: string, stepId: string) => void;
  onOpenImage?: (attachmentId: string) => void;
  onOpenLocalShot?: (previewUrl: string) => void;
}) {
  /**
   * The order the server last reported. A local drop is previewed against this
   * key and thrown away the moment the server answers with a different one, so
   * the list renumbers instantly without ever holding a stale order on screen.
   */
  const serverKey = steps.map((s) => `${s.id}:${s.order}`).join("|");
  const [pending, setPending] = useState<{ key: string; ids: string[] } | null>(null);

  const byOrder = [...steps].sort((a, b) => a.order - b.order);
  const ordered =
    pending && pending.key === serverKey
      ? (pending.ids
          .map((id) => steps.find((s) => s.id === id))
          .filter(Boolean) as TestStep[])
      : byOrder;

  const sensors = useSensors(
    // A small distance so a tap on the text input is never read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Long-press to lift on touch, so scrolling the page still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ordered.findIndex((s) => s.id === active.id);
    const to = ordered.findIndex((s) => s.id === over.id);
    if (from === -1 || to === -1) return;

    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPending({ key: serverKey, ids: next.map((s) => s.id) });
    onReorder?.(String(active.id), to);
  };

  const canDelete = ordered.length > minSteps;

  return (
    <div className="min-w-0">
      {label && (
        <p className="font-brm mb-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
          {label}
        </p>
      )}

      {!ordered.length && (
        <p className="py-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {TESTING_LABELS.noSteps}
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={ordered.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex min-w-0 flex-col gap-2">
            {ordered.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                index={index}
                readOnly={readOnly}
                canDelete={canDelete}
                liveUpdate={liveUpdate}
                onBodyChange={onBodyChange}
                onDelete={onDelete}
                onAttach={onAttach}
                onDetach={onDetach}
                onOpenImage={onOpenImage}
                onOpenLocalShot={onOpenLocalShot}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {!readOnly && onAdd && (
        <button type="button" className="brm-add-row mt-2" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {TESTING_LABELS.addStep}
        </button>
      )}
    </div>
  );
}
