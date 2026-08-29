"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RequirementStatusBadge } from "./MeetingBadges";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { MEETING_LABELS, REQUIREMENT_STATUS_LABELS, ROLE_COLORS, ROLE_LABELS } from "@/lib/constants";

type Person = {
  id?: string;
  firstName?: string;
  lastName?: string;
  role?: string | null;
};

type HistoryRow = {
  id: string;
  createdAt: string;
  changedBy?: Person | null;
  note?: string | null;
};

function personName(changedBy?: Person | null) {
  return [changedBy?.firstName, changedBy?.lastName].filter(Boolean).join(" ");
}

function sortDesc<T extends { createdAt: string }>(rows: T[]) {
  return [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function PersonLine({ person, currentUserId }: { person?: Person | null; currentUserId?: string }) {
  const name = personName(person);
  if (!name) return null;
  const roleColor = ROLE_COLORS[person?.role ?? ""] ?? "#64748B";
  const isMe = currentUserId && person?.id === currentUserId;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {person?.id ? (
        <Link
          href={`/users/${person.id}`}
          className="font-medium no-underline hover:no-underline"
          style={{ color: "#4F46E5" }}
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium" style={{ color: "var(--foreground)" }}>
          {name}
        </span>
      )}
      {isMe && (
        <span className="brm-badge brm-badge-you shrink-0">{MEETING_LABELS.you}</span>
      )}
      {person?.role && (
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
          style={{
            background: `${roleColor}18`,
            color: roleColor,
            border: `1px solid ${roleColor}40`,
          }}
        >
          {ROLE_LABELS[person.role] ?? person.role}
        </span>
      )}
    </span>
  );
}

/** Long description edits — clamped by default; «عرض المزيد» reveals the full text. */
function ExpandableNote({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lineCount = trimmed.split("\n").length;
  const needsExpand = lineCount > 1 || trimmed.length > 60;

  return (
    <div
      className="mt-2 min-w-0 rounded-lg border px-3 py-2"
      style={{
        background: "color-mix(in srgb, var(--muted) 40%, transparent)",
        borderColor: "var(--border)",
      }}
    >
      <p
        className={`whitespace-pre-wrap text-sm leading-relaxed break-words ${!expanded && needsExpand ? "line-clamp-3" : ""}`}
        style={{ color: "var(--foreground)" }}
      >
        {trimmed}
      </p>

      {needsExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs font-semibold underline-offset-2 hover:underline"
          style={{ color: "#818CF8" }}
        >
          {expanded ? MEETING_LABELS.showLess : MEETING_LABELS.showMore}
        </button>
      )}
    </div>
  );
}

function DescriptionChangeBadge() {
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold leading-4"
      style={{
        background: "color-mix(in srgb, #6366F1 14%, transparent)",
        color: "#818CF8",
        border: "1px solid color-mix(in srgb, #6366F1 35%, transparent)",
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "#6366F1" }}
        aria-hidden
      />
      {MEETING_LABELS.descriptionChanged}
    </span>
  );
}

/** Cap long histories so the page does not grow forever. Stay unscrollable
 *  until the rows actually exceed the cap — `overflow-y: auto` on a short
 *  list still becomes a scrollport and eats the wheel for a few leftover pixels. */
const HISTORY_MAX_CLASS =
  "max-h-80 overflow-y-auto overscroll-contain pe-1 [-webkit-overflow-scrolling:touch]";

function HistoryStack({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const capPx = () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize || "16");
      return 20 * (Number.isFinite(root) ? root : 16);
    };

    const sync = () => setNeedsScroll(el.scrollHeight > capPx() + 1);
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={ref} className={needsScroll ? HISTORY_MAX_CLASS : undefined}>
      {children}
    </div>
  );
}

function TimelineEntry({
  badge,
  verb,
  person,
  createdAt,
  note,
  currentUserId,
  isFirst,
  isLast,
}: {
  badge: React.ReactNode;
  verb: string;
  person?: Person | null;
  createdAt: string;
  note?: string | null;
  currentUserId?: string;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1.5">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: isFirst ? "#6366F1" : "var(--border)" }}
          aria-hidden
        />
        {!isLast && (
          <span className="w-px flex-1 mt-1" style={{ background: "var(--border)" }} aria-hidden />
        )}
      </div>

      <div className="pb-3 min-w-0 flex-1">
        <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
          <PersonLine person={person} currentUserId={currentUserId} />{" "}
          <span style={{ color: "var(--muted-foreground)" }}>{verb}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">{badge}</div>
        {note ? <ExpandableNote text={note} /> : null}
        <p className="font-brm text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          <RelativeTime date={createdAt} />
        </p>
      </div>
    </div>
  );
}

export function RequirementStatusHistoryList({
  rows,
  empty,
  currentUserId,
}: {
  rows: (HistoryRow & { toStatus: string })[];
  empty: string;
  currentUserId?: string;
}) {
  const sorted = sortDesc(rows);
  if (!sorted.length) {
    return (
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        {empty}
      </p>
    );
  }

  return (
    <HistoryStack>
      {sorted.map((row, i) => (
        <TimelineEntry
          key={row.id}
          badge={<RequirementStatusBadge status={row.toStatus} />}
          verb={REQUIREMENT_STATUS_LABELS[row.toStatus] ?? row.toStatus}
          person={row.changedBy}
          createdAt={row.createdAt}
          note={row.note}
          currentUserId={currentUserId}
          isFirst={i === 0}
          isLast={i === sorted.length - 1}
        />
      ))}
    </HistoryStack>
  );
}

export function RequirementDescriptionHistoryList({
  rows,
  empty,
  currentUserId,
}: {
  rows: (HistoryRow & { toDescription?: string | null })[];
  empty: string;
  currentUserId?: string;
}) {
  const sorted = sortDesc(rows);
  if (!sorted.length) {
    return (
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        {empty}
      </p>
    );
  }

  return (
    <HistoryStack>
      {sorted.map((row, i) => (
        <TimelineEntry
          key={row.id}
          badge={<DescriptionChangeBadge />}
          verb={MEETING_LABELS.descriptionChanged}
          person={row.changedBy}
          createdAt={row.createdAt}
          note={row.toDescription ?? row.note}
          currentUserId={currentUserId}
          isFirst={i === 0}
          isLast={i === sorted.length - 1}
        />
      ))}
    </HistoryStack>
  );
}

type StatusHistoryRow = HistoryRow & { toStatus: string };
type DescriptionHistoryRow = HistoryRow & { toDescription?: string | null };

type CombinedHistoryRow =
  | ({ kind: "status" } & StatusHistoryRow)
  | ({ kind: "description" } & DescriptionHistoryRow);

/** Status + description edits in one timeline, newest first — same rhythm as ticket activity. */
export function RequirementHistoryList({
  statusRows,
  descriptionRows,
  empty = MEETING_LABELS.historyEmpty,
  currentUserId,
}: {
  statusRows: StatusHistoryRow[];
  descriptionRows: DescriptionHistoryRow[];
  empty?: string;
  currentUserId?: string;
}) {
  const sorted = useMemo<CombinedHistoryRow[]>(() => {
    const rows: CombinedHistoryRow[] = [
      ...statusRows.map((row) => ({ kind: "status" as const, ...row })),
      ...descriptionRows.map((row) => ({ kind: "description" as const, ...row })),
    ];
    return rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [statusRows, descriptionRows]);

  if (!sorted.length) {
    return (
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        {empty}
      </p>
    );
  }

  return (
    <HistoryStack>
      {sorted.map((row, i) => (
        <TimelineEntry
          key={`${row.kind}-${row.id}`}
          badge={
            row.kind === "status" ? (
              <RequirementStatusBadge status={row.toStatus} />
            ) : (
              <DescriptionChangeBadge />
            )
          }
          verb={
            row.kind === "status"
              ? (REQUIREMENT_STATUS_LABELS[row.toStatus] ?? row.toStatus)
              : MEETING_LABELS.descriptionChanged
          }
          person={row.changedBy}
          createdAt={row.createdAt}
          note={row.kind === "status" ? row.note : (row.toDescription ?? row.note)}
          currentUserId={currentUserId}
          isFirst={i === 0}
          isLast={i === sorted.length - 1}
        />
      ))}
    </HistoryStack>
  );
}
