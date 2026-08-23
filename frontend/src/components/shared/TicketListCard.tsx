"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Archive, Clock, User } from "lucide-react";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { TicketCodeBadge } from "@/components/shared/TicketCodeBadge";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { UserNameWithYou } from "@/components/shared/UserNameWithYou";
import { TICKET_TYPE_LABELS } from "@/lib/constants";
import { parseTimestamp } from "@/lib/dates";
import { isPastDue } from "@/lib/due-remaining";

const DONE_STATUSES = new Set(["CLOSED", "COMPLETED", "REJECTED"]);

const STATUS_BAR_COLORS: Record<string, string> = {
  DRAFT:                   "#94A3B8",
  NEW:                     "#3B82F6",
  AWAITING_INFO:           "#F59E0B",
  AWAITING_APPROVAL:       "#F97316",
  APPROVED:                "#10B981",
  REJECTED:                "#EF4444",
  SCHEDULED:               "#8B5CF6",
  IN_PROGRESS:             "#22C55E",
  AWAITING_TESTING:        "#06B6D4",
  AWAITING_OWNER_APPROVAL: "#14B8A6",
  COMPLETED:               "#10B981",
  CLOSED:                  "#6B7280",
  ON_HOLD:                 "#94A3B8",
};

export type TicketListCardTicket = {
  id: string;
  title: string;
  status: string;
  type: string;
  ticketNumber?: number | null;
  priority?: string | null;
  finalPriority?: string | null;
  estimatedDeadline?: string | null;
  createdAt: string;
  creator?: { id: string; firstName?: string; lastName?: string } | null;
  system?: { name?: string } | null;
  company?: { id: string; name: string; logoUrl?: string | null } | null;
  assignments?: { developer?: { firstName?: string; lastName?: string } | null }[] | null;
};

function isOverdue(ticket: { estimatedDeadline?: string | null; status: string }) {
  if (!ticket.estimatedDeadline || DONE_STATUSES.has(ticket.status)) return false;
  return isPastDue(ticket.estimatedDeadline);
}

export function TicketListCard({
  ticket,
  currentUserId,
  archived = false,
}: {
  ticket: TicketListCardTicket;
  currentUserId?: string;
  archived?: boolean;
}) {
  const barColor = STATUS_BAR_COLORS[ticket.status] ?? "#94A3B8";
  const assignedDev = ticket.assignments?.[0]?.developer;
  const assignedDevName = [assignedDev?.firstName, assignedDev?.lastName]
    .filter(Boolean)
    .join(" ");
  const assignedDevLabel = assignedDevName
    ? `المطور المُكلَّف: ${assignedDevName}`
    : "المطور المُكلَّف";

  return (
    <Link href={`/tickets/${ticket.id}`} style={{ display: "block" }}>
      <div
        className="rounded-xl flex overflow-hidden transition-all hover:shadow-md"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div className="w-1 shrink-0 self-stretch" style={{ background: barColor, borderRadius: "0 4px 4px 0" }} />

        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {archived && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                    style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                  >
                    <Archive className="w-3 h-3" /> مؤرشفة
                  </span>
                )}
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.finalPriority || ticket.priority} />
                <TicketCodeBadge ticketNumber={ticket.ticketNumber} />
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{TICKET_TYPE_LABELS[ticket.type]}</span>
              </div>
              <h3 className="brm-row-title font-semibold" style={{ color: "var(--foreground)" }}>{ticket.title}</h3>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span
                  className="flex items-center gap-1 text-xs cursor-help"
                  title="طالب التذكرة"
                  aria-label="طالب التذكرة"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <User className="w-3 h-3" aria-hidden />
                  <UserNameWithYou person={ticket.creator} currentUserId={currentUserId} />
                </span>
                {ticket.system?.name && (
                  <span
                    className="text-xs cursor-help"
                    title="النظام"
                    aria-label="النظام"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {ticket.system.name}
                  </span>
                )}
                {ticket.company && (
                  <span
                    className="flex items-center gap-1 text-xs cursor-help"
                    title="الشركة"
                    aria-label="الشركة"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <CompanyLogo company={ticket.company} size="xs" />
                    {ticket.company.name}
                  </span>
                )}
                {ticket.estimatedDeadline && (
                  <span
                    className={`flex items-center gap-1 text-xs cursor-help ${isOverdue(ticket) ? "brm-overdue" : ""}`}
                    title="تاريخ التسليم المتوقع"
                    aria-label="تاريخ التسليم المتوقع"
                    style={{ color: isOverdue(ticket) ? undefined : "var(--muted-foreground)" }}
                  >
                    <Clock className="w-3 h-3" aria-hidden />
                    التسليم: {format(parseTimestamp(ticket.estimatedDeadline), "d MMM yyyy", { locale: ar })}
                  </span>
                )}
                <RelativeTime date={ticket.createdAt} label="تاريخ الإنشاء" />
              </div>
            </div>
            {ticket.assignments?.[0] && (
              <div
                title={assignedDevLabel}
                aria-label={assignedDevLabel}
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-indigo-600 text-sm shrink-0 cursor-help"
                style={{ background: "rgba(79,70,229,0.1)" }}
              >
                {assignedDev?.firstName?.[0]}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
