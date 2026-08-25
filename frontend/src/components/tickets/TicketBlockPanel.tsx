"use client";
import Link from "next/link";
import { OctagonPause, PauseCircle, PlayCircle } from "lucide-react";
import { BLOCK_LABELS, TICKET_STATUS_LABELS } from "@/lib/constants";
import { formatTicketCode } from "@/lib/utils";

/** The statuses where work is actually under way, so stopping it means something. */
const BLOCKABLE = ["SCHEDULED", "IN_PROGRESS", "AWAITING_TESTING"];
const TERMINAL = ["COMPLETED", "CLOSED", "REJECTED"];

export type PauseKind = "block" | "hold" | "resume";

/**
 * Stop and restart controls.
 *
 * Two ways a ticket stops, kept apart on purpose: BLOCKED is involuntary —
 * something outside the ticket is in the way — while ON_HOLD is a deliberate
 * parking decision.
 *
 * The reason lives in the confirmation dialog rather than here. req.md §21
 * requires one, but an always-open textarea in the sidebar reads as a field
 * waiting to be filled in on every visit, which it is not.
 */
export function TicketBlockPanel({
  status,
  canBlock,
  canHold,
  canResume,
  onRequest,
}: {
  status: string;
  canBlock: boolean;
  canHold: boolean;
  canResume: boolean;
  onRequest: (kind: PauseKind) => void;
}) {
  const stopped = status === "BLOCKED" || status === "ON_HOLD";
  const showBlock = canBlock && BLOCKABLE.includes(status);
  const showHold = canHold && !stopped && !TERMINAL.includes(status);

  if (stopped) {
    if (!canResume) return null;
    return (
      <button type="button" onClick={() => onRequest("resume")} className="brm-tone-btn w-full" data-tone="success">
        <PlayCircle className="w-4 h-4" aria-hidden />
        {BLOCK_LABELS.resume}
      </button>
    );
  }

  if (!showBlock && !showHold) return null;

  return (
    <div className="flex gap-2">
      {showBlock && (
        <button type="button" onClick={() => onRequest("block")} className="brm-tone-btn flex-1" data-tone="danger">
          <OctagonPause className="w-4 h-4" aria-hidden />
          {BLOCK_LABELS.block}
        </button>
      )}
      {showHold && (
        <button type="button" onClick={() => onRequest("hold")} className="brm-tone-btn flex-1" data-tone="neutral">
          <PauseCircle className="w-4 h-4" aria-hidden />
          {BLOCK_LABELS.hold}
        </button>
      )}
    </div>
  );
}

/** The reason field, shown inside the confirmation dialog for block and hold. */
export function PauseReasonField({
  value,
  onChange,
  label = BLOCK_LABELS.reason,
  placeholder = BLOCK_LABELS.reasonPlaceholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        autoFocus
        placeholder={placeholder}
        aria-label={label}
        className="w-full mt-1.5 rounded-xl px-3 py-2 text-sm outline-none resize-none"
        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
      />
    </label>
  );
}

/** Why the ticket stopped, at the top of the page rather than buried in the sidebar. */
export function TicketBlockBanner({
  status,
  pauseReason,
  blockedByTicket,
}: {
  status: string;
  pauseReason?: string | null;
  blockedByTicket?: { id: string; ticketNumber: number; title: string } | null;
}) {
  if (status !== "BLOCKED" && status !== "ON_HOLD") return null;
  const blocked = status === "BLOCKED";

  return (
    <div role="status" className="brm-notice" data-tone={blocked ? "danger" : "neutral"}>
      {blocked
        ? <OctagonPause className="brm-notice-icon w-5 h-5 shrink-0 mt-0.5" aria-hidden />
        : <PauseCircle className="brm-notice-icon w-5 h-5 shrink-0 mt-0.5" aria-hidden />}
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          {blocked ? BLOCK_LABELS.blockedBanner : BLOCK_LABELS.heldBanner}
          <span className="font-normal" style={{ color: "var(--muted-foreground)" }}>
            {` — ${TICKET_STATUS_LABELS[status]}`}
          </span>
        </p>
        {pauseReason && (
          <p className="text-sm mt-1" style={{ color: "var(--foreground)" }}>{pauseReason}</p>
        )}
        {blockedByTicket && (
          <Link
            href={`/tickets/${blockedByTicket.id}`}
            className="brm-ticket-link text-xs mt-1.5 inline-flex items-baseline gap-1.5 flex-wrap"
            style={{ color: "var(--muted-foreground)" }}
          >
            <span>{BLOCK_LABELS.blockedBy}</span>
            <span className="font-brm whitespace-nowrap" dir="ltr">
              {formatTicketCode(blockedByTicket.ticketNumber) ?? `#${blockedByTicket.ticketNumber}`}
            </span>
            <span>— {blockedByTicket.title}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
