"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  TICKET_STATUS_LABELS,
  TIMELINE_FILTERS,
  TIMELINE_LABELS,
  TASK_STATUS_LABELS,
  TASK_LABELS,
  DIFFICULTY_LABELS,
  ESTIMATE_LABELS,
  ROLE_COLORS,
  ROLE_LABELS,
  COMMENT_LABELS,
  type TimelineFilterKey,
} from "@/lib/constants";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { formatTicketCode } from "@/lib/utils";
import { useTicketTimeline } from "@/hooks/useTickets";
import { useAuthStore } from "@/store/auth";

type Person = { id: string; firstName: string; lastName: string; role?: string | null };
type TicketRef = { id: string; ticketNumber: number; title: string };
type Relation = { label: string; ticket: TicketRef };

type Entry = {
  id: string;
  action: string;
  entity: string;
  at: string;
  actor?: Person | null;
  subjects?: Person[];
  relation?: Relation | null;
  from?: Record<string, unknown> | null;
  to?: Record<string, unknown> | null;
};

function parseBag(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

const statusLabel = (v: unknown) =>
  typeof v === "string" ? TICKET_STATUS_LABELS[v] ?? v : undefined;

const taskStatusLabel = (v: unknown) =>
  typeof v === "string" ? TASK_STATUS_LABELS[v] ?? v : undefined;

function taskTitle(from?: Record<string, unknown> | null, to?: Record<string, unknown> | null) {
  if (typeof to?.title === "string" && to.title.trim()) return to.title;
  if (typeof from?.title === "string" && from.title.trim()) return from.title;
  return undefined;
}

function taskStatusMove(from?: Record<string, unknown> | null, to?: Record<string, unknown> | null) {
  const before = taskStatusLabel(from?.status);
  const after = taskStatusLabel(to?.status);
  // Arabic "from → to" — a bare ← flips under RTL when values are Latin/digits.
  if (before && after) return `من ${before} إلى ${after}`;
  return after ?? before;
}

function planDateValue(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "string") {
    const d = v.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
  }
  return undefined;
}

function planHoursValue(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function planDifficultyValue(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return DIFFICULTY_LABELS[v] ?? String(v);
  return undefined;
}

function planFieldChange(
  label: string,
  from: unknown,
  to: unknown,
  format: (v: unknown) => string | undefined,
): string | undefined {
  const before = format(from);
  const after = format(to);
  if (before === after) return undefined;
  // "من … إلى …" stays in reading order under RTL; `قبل ← بعد` visually reverses.
  if (before && after) return `${label}: من ${before} إلى ${after}`;
  if (after) return `${label}: ${after}`;
  if (before) return `${label}: من ${before} إلى —`;
  return undefined;
}

function planTextValue(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

function planDetailOf(from?: Record<string, unknown> | null, to?: Record<string, unknown> | null): string | undefined {
  if (!to && !from) return undefined;
  const parts = [
    planFieldChange("تاريخ البدء", from?.scheduledStart, to?.scheduledStart, planDateValue),
    planFieldChange("تاريخ التسليم", from?.estimatedDeadline, to?.estimatedDeadline, planDateValue),
    planFieldChange(ESTIMATE_LABELS.hours, from?.estimatedHours, to?.estimatedHours, planHoursValue),
    planFieldChange(ESTIMATE_LABELS.difficulty, from?.difficultyLevel, to?.difficultyLevel, planDifficultyValue),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Field-level diff for TASK_UPDATE — same shape as plan updates. */
function taskUpdateDetailOf(
  from?: Record<string, unknown> | null,
  to?: Record<string, unknown> | null,
): string | undefined {
  if (!to && !from) return undefined;
  const parts = [
    planFieldChange("العنوان", from?.title, to?.title, planTextValue),
    planFieldChange("الوصف", from?.description, to?.description, planTextValue),
    planFieldChange(TASK_LABELS.dueDate, from?.dueDate, to?.dueDate, planDateValue),
    planFieldChange(ESTIMATE_LABELS.hours, from?.estimatedHours, to?.estimatedHours, planHoursValue),
    planFieldChange(ESTIMATE_LABELS.difficulty, from?.difficultyLevel, to?.difficultyLevel, planDifficultyValue),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function personName(p?: Person | null) {
  if (!p) return "";
  return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
}

function PersonLink({
  person,
  currentUserId,
  markYou = false,
}: {
  person: Person;
  currentUserId?: string;
  markYou?: boolean;
}) {
  const name = personName(person);
  if (!name) return null;
  const roleColor = ROLE_COLORS[person.role ?? ""] ?? "#64748B";
  const isMe = markYou && !!currentUserId && person.id === currentUserId;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link
        href={`/users/${person.id}`}
        className="font-medium no-underline hover:no-underline"
        style={{ color: "#4F46E5" }}
      >
        {name}
      </Link>
      {isMe && (
        <span className="brm-badge brm-badge-you shrink-0">{COMMENT_LABELS.you}</span>
      )}
      {person.role && (
        <span
          className="text-xs px-1.5 py-0.5 rounded font-medium"
          style={{
            color: roleColor,
            background: `color-mix(in srgb, ${roleColor} 14%, transparent)`,
          }}
        >
          {ROLE_LABELS[person.role] ?? person.role}
        </span>
      )}
    </span>
  );
}

function TicketLink({ ticket }: { ticket: TicketRef }) {
  const code = formatTicketCode(ticket.ticketNumber);
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="brm-ticket-link inline-flex items-baseline gap-1 flex-wrap"
    >
      {code && <span className="font-brm text-xs opacity-80" dir="ltr">{code}</span>}
      <span>{ticket.title}</span>
    </Link>
  );
}

function SubjectList({ subjects }: { subjects: Person[] }) {
  if (!subjects.length) return null;
  return (
    <>
      {subjects.map((s, i) => (
        <span key={s.id}>
          {i > 0 && (i < subjects.length - 1 ? "، " : " و")}
          <PersonLink person={s} />
        </span>
      ))}
    </>
  );
}

function isTicketRef(v: unknown): v is TicketRef {
  if (!v || typeof v !== "object") return false;
  const t = v as { id?: unknown; ticketNumber?: unknown; title?: unknown };
  if (typeof t.id !== "string") return false;
  const n = t.ticketNumber;
  return typeof n === "number" || (typeof n === "string" && n.length > 0);
}

function normalizeTicketRef(v: unknown): TicketRef | null {
  if (!isTicketRef(v)) return null;
  const t = v as TicketRef & { ticketNumber: number | string };
  const ticketNumber = typeof t.ticketNumber === "number" ? t.ticketNumber : parseInt(t.ticketNumber, 10);
  if (!Number.isFinite(ticketNumber)) return null;
  return {
    id: t.id,
    ticketNumber,
    title: t.title?.trim() ? t.title : `#${ticketNumber}`,
  };
}

function relationLabel(
  ticketId: string,
  type: string,
  blocking: string,
  blocked: string,
  removing = false,
): string {
  const isBlocked = blocked === ticketId;
  const prefix = removing ? "أزال" : "أضاف";
  if (type === "BLOCKS") {
    return isBlocked ? `${prefix} اعتماداً على` : `${prefix} حجباً لـ`;
  }
  if (type === "RELATES_TO") return `${prefix} ربطاً مع`;
  if (type === "DUPLICATES") return isBlocked ? `${prefix} تكراراً من` : `${prefix} تكراراً في`;
  return removing ? "أزال علاقة مع" : "أضاف علاقة مع";
}

/** Resolve relation from API field or embedded audit snapshot. */
function resolveRelation(entry: Entry, ticketId: string): Relation | null {
  if (entry.relation?.ticket) {
    const ticket = normalizeTicketRef(entry.relation.ticket);
    if (ticket) return { label: entry.relation.label, ticket };
  }

  const from = parseBag(entry.from);
  const to = parseBag(entry.to);

  if (entry.action === "DEPENDENCY_REMOVE") {
    const ticket = normalizeTicketRef(from?.otherTicket);
    if (ticket) {
      const blocking = typeof from?.blockingTicketId === "string" ? from.blockingTicketId : ticket.id;
      const blocked = typeof from?.blockedTicketId === "string" ? from.blockedTicketId : ticket.id;
      const type = typeof from?.type === "string" ? from.type : "BLOCKS";
      return { label: relationLabel(ticketId, type, blocking, blocked, true), ticket };
    }
    return null;
  }

  if (entry.action === "DEPENDENCY_ADD" && to) {
    const ticket = normalizeTicketRef(to.otherTicket);
    if (!ticket) return null;

    const blocking = typeof to.blockingTicketId === "string" ? to.blockingTicketId : ticket.id;
    const blocked = typeof to.blockedTicketId === "string" ? to.blockedTicketId : ticket.id;
    const type = typeof to.type === "string" ? to.type : "BLOCKS";
    return { label: relationLabel(ticketId, type, blocking, blocked), ticket };
  }

  return null;
}

/** The one line under the headline that says what actually changed. */
function detailOf(entry: Entry): string | undefined {
  const { action, from, to } = entry;

  if (action === "STATUS_CHANGE" || action === "FORCE_STATUS") {
    const before = statusLabel(from?.status);
    const after = statusLabel(to?.status);
    const move = before && after ? `من ${before} إلى ${after}` : after;
    const reason = typeof to?.reason === "string" ? to.reason : undefined;
    return [move, reason].filter(Boolean).join(" · ");
  }

  if (action === "TASK_STATUS_CHANGE") {
    return [taskTitle(from, to), taskStatusMove(from, to)].filter(Boolean).join(" · ");
  }

  if (action.startsWith("TASK_")) {
    const title = taskTitle(from, to);
    if (action === "TASK_DELETE") {
      const status = taskStatusLabel(from?.status);
      return [title, status ? `كانت ${status}` : undefined].filter(Boolean).join(" · ");
    }
    if (action === "TASK_CREATE") {
      return title;
    }
    if (action === "TASK_UPDATE") {
      return taskUpdateDetailOf(from, to);
    }
    return title;
  }

  if (action === "PLAN_UPDATED") {
    return planDetailOf(from, to);
  }

  return undefined;
}

function actionLabel(action: string): string {
  return TIMELINE_LABELS[action as keyof typeof TIMELINE_LABELS] ?? action;
}

function EntryLine({
  entry,
  ticketId,
  currentUserId,
}: {
  entry: Entry;
  ticketId: string;
  currentUserId?: string;
}) {
  const verb = actionLabel(entry.action);
  const subjects = entry.subjects ?? [];
  const actor = entry.actor;
  const relation = resolveRelation(entry, ticketId);
  const actorLink = actor ? <PersonLink person={actor} currentUserId={currentUserId} markYou /> : null;

  if (entry.action === "LEAD_CHANGED" && subjects[0]) {
    return (
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {actorLink}{" "}
        <span style={{ color: "var(--muted-foreground)" }}>{verb} </span>
        <SubjectList subjects={subjects} />
        <span style={{ color: "var(--muted-foreground)" }}> {TIMELINE_LABELS.LEAD_CHANGED_SUFFIX}</span>
      </p>
    );
  }

  if ((entry.action === "ASSIGNEE_ADD" || entry.action === "ASSIGNEE_REMOVE") && subjects[0]) {
    return (
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {actorLink}{" "}
        <span style={{ color: "var(--muted-foreground)" }}>{verb} </span>
        <SubjectList subjects={subjects} />
      </p>
    );
  }

  if (entry.action === "ASSIGNEES_CHANGED" && subjects.length > 0) {
    return (
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {actorLink}{" "}
        <span style={{ color: "var(--muted-foreground)" }}>{verb}: </span>
        <SubjectList subjects={subjects} />
      </p>
    );
  }

  if (entry.action.startsWith("TASK_") && subjects[0]) {
    const name = taskTitle(entry.from, entry.to);
    return (
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {actorLink}{" "}
        <span style={{ color: "var(--muted-foreground)" }}>{verb} </span>
        {name && (
          <>
            <span className="font-medium" style={{ color: "var(--foreground)" }}>«{name}» </span>
          </>
        )}
        <span style={{ color: "var(--muted-foreground)" }}>لـ </span>
        <SubjectList subjects={subjects} />
      </p>
    );
  }

  if (relation) {
    return (
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {actorLink}{" "}
        <span style={{ color: "var(--muted-foreground)" }}>{relation.label}{" "}</span>
        <TicketLink ticket={relation.ticket} />
      </p>
    );
  }

  if (entry.action === "DEPENDENCY_ADD" || entry.action === "DEPENDENCY_REMOVE") {
    return (
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {actorLink}{" "}
        <span style={{ color: "var(--muted-foreground)" }}>{verb}</span>
      </p>
    );
  }

  return (
    <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
      {actorLink}{" "}
      <span style={{ color: "var(--muted-foreground)" }}>{verb}</span>
    </p>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
      style={{
        background: active ? "var(--card)" : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {label}
    </button>
  );
}

/**
 * Everything that has happened to the ticket, not only its status.
 *
 * The old panel read `ticket.statusHistory`, so a task being finished or a
 * developer joining left no trace — the two things people most often want to
 * account for. Every such change already writes an audit row; this reads them.
 */
export function TicketTimeline({ ticketId }: { ticketId: string }) {
  const [filter, setFilter] = useState<TimelineFilterKey>("all");
  const { data } = useTicketTimeline(ticketId);
  const user = useAuthStore((s) => s.user);
  const entries = (Array.isArray(data) ? data : []) as Entry[];

  const filtered = useMemo(() => {
    const allowed = TIMELINE_FILTERS[filter].actions;
    const list = !allowed
      ? entries
      : entries.filter((e) => (allowed as readonly string[]).includes(e.action));
    return [...list].reverse();
  }, [entries, filter]);

  const filterKeys = Object.keys(TIMELINE_FILTERS) as TimelineFilterKey[];

  return (
    <div className="rounded-xl overflow-visible" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div
        className="px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h3 className="font-semibold text-sm shrink-0" style={{ color: "var(--foreground)" }}>
          {TIMELINE_LABELS.section}
        </h3>
        <div
          className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-full sm:w-fit max-w-full"
          style={{ background: "var(--muted)" }}
          role="group"
          aria-label="تصفية النشاط"
        >
          {filterKeys.map((key) => (
            <FilterPill
              key={key}
              label={TIMELINE_FILTERS[key].label}
              active={filter === key}
              onClick={() => setFilter(key)}
            />
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-1 max-h-80 overflow-y-auto overscroll-contain">
        {filtered.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {entries.length === 0 ? TIMELINE_LABELS.empty : TIMELINE_LABELS.emptyFilter}
          </p>
        )}

        {filtered.map((entry, i) => {
          const detail = detailOf(entry);
          return (
            <div key={entry.id} className="flex gap-3">
              <div className="flex flex-col items-center pt-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: i === 0 ? "#6366F1" : "var(--border)" }}
                  aria-hidden
                />
                {i < filtered.length - 1 && (
                  <span className="w-px flex-1 mt-1" style={{ background: "var(--border)" }} aria-hidden />
                )}
              </div>

              <div className="pb-3 min-w-0 flex-1">
                <EntryLine entry={entry} ticketId={ticketId} currentUserId={user?.id} />
                {detail && (
                  <p className="text-sm mt-0.5 break-words" style={{ color: "var(--foreground)" }}>{detail}</p>
                )}
                <p className="font-brm text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  <RelativeTime date={entry.at} />
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
