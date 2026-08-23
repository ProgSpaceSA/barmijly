"use client";
import { useEffect, useRef, useState } from "react";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { ASSIGNEE_LABELS, DIFFICULTY_LABELS, ESTIMATE_LABELS, SELECT_PLACEHOLDERS } from "@/lib/constants";
import { useTicketAction } from "@/hooks/useTickets";

export type TicketPlanValues = {
  scheduledStart?: string | null;
  estimatedDeadline?: string | null;
  estimatedHours?: number | null;
  difficultyLevel?: number | null;
};

type Draft = {
  scheduledStart: string;
  estimatedDeadline: string;
  estimatedHours: string;
  difficultyLevel: string;
};

function dateInputValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function toDraft(plan: TicketPlanValues): Draft {
  return {
    scheduledStart: dateInputValue(plan.scheduledStart),
    estimatedDeadline: dateInputValue(plan.estimatedDeadline),
    estimatedHours: plan.estimatedHours != null ? String(plan.estimatedHours) : "",
    difficultyLevel: plan.difficultyLevel != null ? String(plan.difficultyLevel) : "",
  };
}

function toPayload(draft: Draft) {
  return {
    scheduledStart: draft.scheduledStart || null,
    estimatedDeadline: draft.estimatedDeadline || null,
    estimatedHours: draft.estimatedHours ? parseInt(draft.estimatedHours, 10) : null,
    difficultyLevel: draft.difficultyLevel ? parseInt(draft.difficultyLevel, 10) : null,
  };
}

/** Only send fields that actually changed — avoids clearing untouched plan values. */
function patchFromDraft(draft: Draft, plan: TicketPlanValues, estimateOnly: boolean) {
  const next = toPayload(draft);
  const prev = toPayload(toDraft(plan));
  const patch: Partial<ReturnType<typeof toPayload>> = {};
  if (!estimateOnly) {
    if ((prev.scheduledStart ?? null) !== (next.scheduledStart ?? null)) patch.scheduledStart = next.scheduledStart;
    if ((prev.estimatedDeadline ?? null) !== (next.estimatedDeadline ?? null)) {
      patch.estimatedDeadline = next.estimatedDeadline;
    }
  }
  if ((prev.estimatedHours ?? null) !== (next.estimatedHours ?? null)) patch.estimatedHours = next.estimatedHours;
  if ((prev.difficultyLevel ?? null) !== (next.difficultyLevel ?? null)) patch.difficultyLevel = next.difficultyLevel;
  return patch;
}

function draftMatchesPlan(draft: Draft, plan: TicketPlanValues, estimateOnly: boolean) {
  const payload = toPayload(draft);
  if (estimateOnly) {
    return (
      (plan.estimatedHours ?? null) === payload.estimatedHours &&
      (plan.difficultyLevel ?? null) === payload.difficultyLevel
    );
  }
  return (
    dateInputValue(plan.scheduledStart) === (payload.scheduledStart ?? "") &&
    dateInputValue(plan.estimatedDeadline) === (payload.estimatedDeadline ?? "") &&
    (plan.estimatedHours ?? null) === payload.estimatedHours &&
    (plan.difficultyLevel ?? null) === payload.difficultyLevel
  );
}

/** Linear-style pause before sending — batches quick edits into one request. */
const SAVE_DELAY_MS = 400;
const SAVED_HINT_MS = 2000;

const difficultyItems = Object.entries(DIFFICULTY_LABELS).map(([value, label]) => ({ value, label }));

const inputClass = "w-full rounded-xl px-3 py-2 text-xs outline-none";
const inputStyle = {
  background: "var(--muted)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
};

/**
 * Ticket plan fields — schedule, estimate, difficulty.
 *
 * Like Linear: local edits show immediately, a short debounce sends the save,
 * the ticket cache updates optimistically, and a subtle inline hint replaces toast spam.
 *
 * `estimateOnly` hides the schedule (developers revise effort, not dates).
 */
export function TicketPlanPanel({
  ticketId,
  canEdit,
  estimateOnly = false,
  plan,
}: {
  ticketId: string;
  canEdit: boolean;
  estimateOnly?: boolean;
  plan: TicketPlanValues;
}) {
  const { updatePlan } = useTicketAction(ticketId);
  const [draft, setDraft] = useState(() => toDraft(plan));
  const [savedHint, setSavedHint] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedHintRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  const planRef = useRef(plan);
  const dirtyRef = useRef(false);

  // Keep refs current for debounce/flush without writing during render (react-hooks/refs).
  useEffect(() => {
    draftRef.current = draft;
    planRef.current = plan;
  });

  useEffect(() => {
    if (updatePlan.isPending) return;
    if (dirtyRef.current) {
      if (draftMatchesPlan(draftRef.current, plan, estimateOnly)) dirtyRef.current = false;
      else return;
    }
    const synced = toDraft(plan);
    if (draftMatchesPlan(draftRef.current, plan, estimateOnly)) return;
    draftRef.current = synced;
    setDraft(synced);
  }, [plan.scheduledStart, plan.estimatedDeadline, plan.estimatedHours, plan.difficultyLevel, updatePlan.isPending, estimateOnly]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedHintRef.current) clearTimeout(savedHintRef.current);
  }, []);

  const flushSave = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const current = draftRef.current;
    if (draftMatchesPlan(current, planRef.current, estimateOnly)) {
      dirtyRef.current = false;
      return;
    }
    const patch = patchFromDraft(current, planRef.current, estimateOnly);
    if (Object.keys(patch).length === 0) {
      dirtyRef.current = false;
      return;
    }
    updatePlan.mutate(patch, {
      onSuccess: () => {
        setSavedHint(true);
        if (savedHintRef.current) clearTimeout(savedHintRef.current);
        savedHintRef.current = setTimeout(() => setSavedHint(false), SAVED_HINT_MS);
      },
    });
  };

  const updateDraft = (patch: Partial<Draft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setSavedHint(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flushSave, SAVE_DELAY_MS);
  };

  const statusHint = updatePlan.isPending
    ? ASSIGNEE_LABELS.planSaving
    : savedHint
      ? ASSIGNEE_LABELS.planSaved
      : null;

  if (!canEdit) return null;

  return (
    <div className="space-y-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2 min-h-[1rem]">
        <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
          {estimateOnly ? ASSIGNEE_LABELS.estimateSection : ASSIGNEE_LABELS.planSection}
        </p>
        {statusHint && (
          <p className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }} aria-live="polite">
            {statusHint}
          </p>
        )}
      </div>

      {!estimateOnly && (
        <>
          <div>
            <p className="font-brm text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>تاريخ البدء</p>
            <input
              type="date"
              aria-label="تاريخ البدء"
              value={draft.scheduledStart}
              onChange={(e) => updateDraft({ scheduledStart: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <p className="font-brm text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
              تاريخ التسليم المتوقع <span style={{ color: "#EF4444" }}>*</span>
            </p>
            <input
              type="date"
              aria-label="تاريخ التسليم المتوقع"
              value={draft.estimatedDeadline}
              onChange={(e) => updateDraft({ estimatedDeadline: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </>
      )}

      <div>
        <p className="font-brm text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>{ESTIMATE_LABELS.hours}</p>
        <input
          type="number"
          min="1"
          aria-label={ESTIMATE_LABELS.hours}
          value={draft.estimatedHours}
          onChange={(e) => updateDraft({ estimatedHours: e.target.value })}
          placeholder="مثال: 8"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <div>
        <p className="font-brm text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>{ESTIMATE_LABELS.difficulty}</p>
        <ThemeSelect
          value={draft.difficultyLevel}
          onChange={(value) => updateDraft({ difficultyLevel: value })}
          placeholder={SELECT_PLACEHOLDERS.difficulty}
          items={difficultyItems}
          aria-label={ESTIMATE_LABELS.difficulty}
          triggerClassName="h-9 min-h-9 text-xs"
        />
      </div>
    </div>
  );
}
