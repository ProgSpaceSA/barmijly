"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { PointRow, type MeetingPoint } from "./PointRow";
import { MEETING_LABELS } from "@/lib/constants";

/**
 * The ordered minutes — the same shape as `OrderedStepList`, and for the same
 * reason: a numbered line the owner reorders by drag or by keyboard.
 *
 * `@dnd-kit` gives the grip a keyboard path for free — focus it, space to lift,
 * arrows to move, space to drop — which matters because drag-only reordering is
 * unreachable for anyone not using a mouse.
 */
export function MinutesList({
  points,
  readOnly = false,
  canCapture = false,
  capturingId,
  onReorder,
  onAdd,
  onDelete,
  onBodyChange,
  onKindChange,
  onCapture,
  onSavingChange,
}: {
  points: MeetingPoint[];
  readOnly?: boolean;
  canCapture?: boolean;
  capturingId?: string | null;
  onReorder?: (id: string, order: number) => void;
  onAdd?: () => void;
  onDelete?: (id: string) => void;
  onBodyChange?: (id: string, body: string) => void | Promise<unknown>;
  onKindChange?: (id: string, kind: string) => void;
  onCapture?: (point: MeetingPoint) => void;
  /** Fires while a debounced edit or API write is in flight. */
  onSavingChange?: (saving: boolean) => void;
}) {
  /**
   * The order the server last reported. A local drop is previewed against this
   * key and thrown away the moment the server answers with a different one, so
   * the list renumbers instantly without ever holding a stale order on screen.
   */
  const serverKey = points.map((p) => `${p.id}:${p.order}`).join("|");
  const [pending, setPending] = useState<{ key: string; ids: string[] } | null>(null);
  const debouncingPoints = useRef(new Set<string>());
  const [debouncing, setDebouncing] = useState(false);
  const [inFlight, setInFlight] = useState(false);

  const setPointDebouncing = useCallback((pointId: string, active: boolean) => {
    if (active) debouncingPoints.current.add(pointId);
    else debouncingPoints.current.delete(pointId);
    setDebouncing(debouncingPoints.current.size > 0);
  }, []);

  const handleBodyChange = useCallback(
    (pointId: string, body: string) => {
      const result = onBodyChange?.(pointId, body);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setInFlight(true);
        void (result as Promise<unknown>).finally(() => setInFlight(false));
      }
    },
    [onBodyChange],
  );

  useEffect(() => {
    onSavingChange?.(debouncing || inFlight);
    return () => onSavingChange?.(false);
  }, [debouncing, inFlight, onSavingChange]);

  const byOrder = [...points].sort((a, b) => a.order - b.order);
  const ordered =
    pending && pending.key === serverKey
      ? (pending.ids.map((id) => points.find((p) => p.id === id)).filter(Boolean) as MeetingPoint[])
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
    const from = ordered.findIndex((p) => p.id === active.id);
    const to = ordered.findIndex((p) => p.id === over.id);
    if (from === -1 || to === -1) return;

    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPending({ key: serverKey, ids: next.map((p) => p.id) });
    onReorder?.(String(active.id), to);
  };

  return (
    <div className="min-w-0">
      {!ordered.length && (
        <p className="py-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {MEETING_LABELS.noPoints}
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="flex min-w-0 flex-col gap-2">
            {ordered.map((point, index) => (
              <PointRow
                key={point.id}
                point={point}
                index={index}
                readOnly={readOnly}
                canCapture={canCapture}
                capturing={capturingId === point.id}
                onBodyChange={handleBodyChange}
                onDebouncingChange={(active) => setPointDebouncing(point.id, active)}
                onKindChange={onKindChange}
                onDelete={onDelete}
                onCapture={onCapture}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {!readOnly && onAdd && (
        <button type="button" className="brm-add-row mt-2" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {MEETING_LABELS.addPoint}
        </button>
      )}
    </div>
  );
}
