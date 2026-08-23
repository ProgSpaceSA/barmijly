"use client";
import { EstimateChip } from "@/components/tickets/EstimateChip";
import { ESTIMATE_LABELS } from "@/lib/constants";

type TicketEstimate = {
  estimatedHours?: number | null;
  difficultyLevel?: number | null;
  tasksEstimatedHours?: number | null;
  effectiveEstimatedHours?: number | null;
  effectiveDifficultyLevel?: number | null;
  actualHours?: number | null;
  openTaskCount?: number | null;
};

function Row({
  label,
  hint,
  hours,
  difficulty,
}: {
  label: string;
  hint?: string;
  hours?: number | null;
  difficulty?: number | null;
}) {
  if (hours == null && difficulty == null) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium" style={{ color: "var(--foreground)" }}>{label}</p>
      {hint && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{hint}</p>
      )}
      <EstimateChip hours={hours} difficulty={difficulty} />
    </div>
  );
}

/**
 * Planned ticket estimate vs task rollup — shown separately so leadership can
 * see both without guessing which number the UI is using.
 */
export function TicketEstimateSummary({ ticket }: { ticket: TicketEstimate }) {
  const hasPlan = ticket.estimatedHours != null || ticket.difficultyLevel != null;
  const hasTasks = ticket.tasksEstimatedHours != null;
  const hasActual = ticket.actualHours != null;
  const tasksDifficulty =
    hasTasks && ticket.effectiveDifficultyLevel != null ? ticket.effectiveDifficultyLevel : null;

  if (!hasPlan && !hasTasks && !hasActual) return null;

  const planDiffersFromTasks =
    hasPlan &&
    hasTasks &&
    (ticket.estimatedHours !== ticket.tasksEstimatedHours ||
      (ticket.difficultyLevel != null &&
        tasksDifficulty != null &&
        ticket.difficultyLevel !== tasksDifficulty));

  return (
    <div className="pt-2 space-y-2.5" style={{ borderTop: "1px solid var(--border)" }}>
      <p className="text-xs pt-2 font-semibold" style={{ color: "var(--foreground)" }}>
        {ESTIMATE_LABELS.summaryTitle}
      </p>

      {hasPlan && (
        <Row
          label={ESTIMATE_LABELS.fromPlan}
          hours={ticket.estimatedHours}
          difficulty={ticket.difficultyLevel}
        />
      )}

      {hasTasks && (
        <Row
          label={ESTIMATE_LABELS.fromTasks}
          hint={
            ticket.openTaskCount != null && ticket.openTaskCount > 0
              ? ESTIMATE_LABELS.fromTasksOpen(ticket.openTaskCount)
              : undefined
          }
          hours={ticket.tasksEstimatedHours}
          difficulty={tasksDifficulty}
        />
      )}

      {planDiffersFromTasks && (
        <p className="text-xs leading-relaxed rounded-lg px-2.5 py-2"
          style={{ background: "rgba(99,102,241,0.08)", color: "var(--muted-foreground)" }}>
          {ESTIMATE_LABELS.tasksOverride}
        </p>
      )}

      {hasActual && (
        <div className="space-y-0.5">
          <p className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
            {ESTIMATE_LABELS.actual}
          </p>
          <EstimateChip actual={ticket.actualHours} />
        </div>
      )}
    </div>
  );
}
