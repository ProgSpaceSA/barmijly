"use client";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { CodeComment } from "@/components/shared/CodeComment";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_TYPE_LABELS, notificationTitle } from "@/lib/constants";
import { TicketCodeBadge } from "@/components/shared/TicketCodeBadge";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { toast } from "sonner";
import Link from "next/link";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { parseTimestamp } from "@/lib/dates";
import { isPastDue } from "@/lib/due-remaining";
import { ar } from "date-fns/locale";
import {
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  ListTodo,
  MessageSquare,
  Plus,
  RefreshCw,
  TriangleAlert,
  UserPlus,
  XCircle,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

interface NotificationTicket {
  title: string;
  ticketNumber?: number | null;
  estimatedDeadline?: string | null;
  status: string;
  company?: { name: string; logoUrl?: string | null } | null;
  system?: { name: string } | null;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  ticketId: string | null;
  createdAt: string;
  ticket?: NotificationTicket | null;
}

const DONE_STATUSES = new Set(["CLOSED", "COMPLETED", "REJECTED"]);

function isOverdue(ticket: NotificationTicket) {
  if (!ticket.estimatedDeadline || DONE_STATUSES.has(ticket.status)) return false;
  return isPastDue(ticket.estimatedDeadline);
}

function ticketLabel(ticket?: NotificationTicket | null) {
  if (!ticket?.title) return null;
  return ticket.title.replace(/^\[SEED\]\s*/, "");
}

function companySystemLabel(ticket: NotificationTicket) {
  const parts = [ticket.company?.name, ticket.system?.name].filter(Boolean);
  return parts.length ? parts.join(" - ") : null;
}

const TYPE_META: Record<string, { color: string; icon: LucideIcon }> = {
  TICKET_CREATED: { color: "#3B82F6", icon: Plus },
  INFO_REQUESTED: { color: "#F59E0B", icon: CircleHelp },
  TICKET_APPROVED: { color: "#10B981", icon: CheckCircle2 },
  TICKET_REJECTED: { color: "#EF4444", icon: XCircle },
  TICKET_ASSIGNED: { color: "#4F46E5", icon: UserPlus },
  STATUS_CHANGED: { color: "#8B5CF6", icon: RefreshCw },
  COMMENT_ADDED: { color: "#06B6D4", icon: MessageSquare },
  DEADLINE_APPROACHING: { color: "#F97316", icon: Clock },
  TICKET_DELAYED: { color: "#EF4444", icon: TriangleAlert },
  EXECUTION_COMPLETED: { color: "#10B981", icon: CheckCircle2 },
  CLOSURE_APPROVAL_REQUESTED: { color: "#14B8A6", icon: ClipboardCheck },
  TASK_ASSIGNED: { color: "#6366F1", icon: ListTodo },
};

const DEFAULT_META = { color: "#6366F1", icon: Bell };

function FilterPill({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
      style={{
        background: active ? "var(--card)" : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {label}
      {count !== undefined && (
        <span
          className="font-brm min-w-4 h-4 px-1 rounded-full flex items-center justify-center"
          style={{
            fontSize: 10,
            background: active ? "rgba(79,70,229,0.12)" : "var(--muted)",
            color: active ? "#4F46E5" : "var(--muted-foreground)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function dateGroupLabel(date: Date): string {
  if (isToday(date)) return "اليوم";
  if (isYesterday(date)) return "أمس";
  if (isThisWeek(date, { weekStartsOn: 6 })) return "هذا الأسبوع";
  return format(date, "d MMMM yyyy", { locale: ar });
}

function groupByDate(items: NotificationItem[]) {
  const groups: { label: string; items: NotificationItem[] }[] = [];
  for (const item of items) {
    const label = dateGroupLabel(new Date(item.createdAt));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function countLabel(total: number, unread: number) {
  if (total === 0) return undefined;
  const totalText = total === 1 ? "إشعار واحد" : `${total} إشعارات`;
  if (unread <= 0) return totalText;
  const unreadText = unread === 1 ? "واحد غير مقروء" : `${unread} غير مقروءة`;
  return `${totalText} · ${unreadText}`;
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const allQuery = useNotifications(unreadOnly ? 1 : page, false);
  const unreadQuery = useNotifications(page, true, unreadOnly);
  const { data: unreadCountData } = useUnreadCount();
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAllRead, isPending: markingAll } = useMarkAllRead();

  const { data, isLoading } = unreadOnly ? unreadQuery : allQuery;
  const notifications: NotificationItem[] = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const allTotal = allQuery.data?.total;
  const unreadCount = typeof unreadCountData === "number" ? unreadCountData : 0;

  const groups = useMemo(() => groupByDate(notifications), [notifications]);

  const setFilter = (nextUnreadOnly: boolean) => {
    setUnreadOnly(nextUnreadOnly);
    setPage(1);
  };

  const handleMarkAll = () => {
    markAllRead(undefined, {
      onSuccess: () => toast.success("تم تعليم جميع الإشعارات كمقروءة"),
      onError: () => toast.error("فشل تعليم الإشعارات"),
    });
  };

  const handleMarkOne = (id: string) => {
    markRead(id, {
      onError: () => toast.error("فشل تعليم الإشعار"),
    });
  };

  return (
    <AppShell>
      <PageHeader
        title="الإشعارات"
        description={countLabel(allTotal ?? 0, unreadCount)}
        action={
          <Button
            variant="outline"
            onClick={handleMarkAll}
            disabled={unreadCount === 0 || markingAll}
          >
            <CheckCheck className="w-4 h-4 ml-2" /> قراءة الكل
          </Button>
        }
      />

      <div className="mb-4">
        <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          <CodeComment>الحالة</CodeComment>
        </p>
        <div className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-fit max-w-full" style={{ background: "var(--muted)" }}>
          <FilterPill
            label="الكل"
            count={allTotal}
            active={!unreadOnly}
            onClick={() => setFilter(false)}
          />
          <FilterPill
            label="غير مقروء"
            count={unreadCount}
            active={unreadOnly}
            onClick={() => setFilter(true)}
          />
        </div>
      </div>

      {isLoading ? (
        <SkeletonList count={6} variant="rows" />
      ) : notifications.length === 0 ? (
        <EmptyState
          title={unreadOnly ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات"}
          command={unreadOnly ? "list notifications --unread" : "list notifications"}
          description={unreadOnly ? "تمت قراءة كل الإشعارات" : "ستظهر هنا التحديثات على التذاكر والمهام"}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {groups.map((group) => (
            <section key={group.label}>
              <h2
                className="font-brm text-xs mb-1.5 uppercase tracking-widest"
                style={{ color: "var(--muted-foreground)" }}
              >
                <CodeComment>{group.label}</CodeComment>
              </h2>
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--border)", background: "var(--card)" }}
              >
                {group.items.map((n, i) => {
                  const meta = TYPE_META[n.type] ?? DEFAULT_META;
                  const Icon = meta.icon;
                  const typeLabel = NOTIFICATION_TYPE_LABELS[n.type] ?? n.type;

                  const row = (
                    <div className="flex items-center gap-3 px-3 py-2 min-w-0 flex-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: n.isRead ? "transparent" : meta.color }}
                      />
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${meta.color}18`, color: meta.color }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="brm-row-title text-sm"
                          style={{ fontWeight: n.isRead ? 500 : 600, color: "var(--foreground)" }}
                        >
                          {notificationTitle(n.type, n.title)}
                        </p>
                        <p className="brm-row-title text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          <span style={{ color: meta.color }}>{typeLabel}</span>
                          <span> · {ticketLabel(n.ticket) ? `«${ticketLabel(n.ticket)}»` : n.body}</span>
                        </p>
                        {n.ticket && (
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <TicketCodeBadge ticketNumber={n.ticket.ticketNumber} />
                            {companySystemLabel(n.ticket) && (
                              <span
                                className="flex items-center gap-1 text-xs cursor-help"
                                title="الشركة - النظام"
                                style={{ color: "var(--muted-foreground)" }}
                              >
                                {n.ticket.company && <CompanyLogo company={n.ticket.company} size="xs" />}
                                {companySystemLabel(n.ticket)}
                              </span>
                            )}
                            {n.ticket.estimatedDeadline && (
                              <span
                                className={`flex items-center gap-1 text-xs cursor-help ${isOverdue(n.ticket) ? "brm-overdue" : ""}`}
                                title="تاريخ التسليم المتوقع"
                                style={{ color: isOverdue(n.ticket) ? undefined : "var(--muted-foreground)" }}
                              >
                                <Clock className="w-3 h-3" aria-hidden />
                                التسليم: {format(parseTimestamp(n.ticket.estimatedDeadline), "d MMM yyyy", { locale: ar })}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );

                  return (
                    <div
                      key={n.id}
                      className="flex flex-wrap items-center gap-2 hover:bg-muted/50 transition-colors ps-0 pe-3"
                      style={{ borderTop: i === 0 ? undefined : "1px solid var(--border)" }}
                    >
                      {n.ticketId ? (
                        <Link
                          href={`/tickets/${n.ticketId}`}
                          className="flex flex-1 basis-64 min-w-0"
                          onClick={() => { if (!n.isRead) handleMarkOne(n.id); }}
                        >
                          {row}
                        </Link>
                      ) : (
                        row
                      )}

                      <div className="flex items-center gap-2 shrink-0 ms-auto pb-2 ps-3 sm:pb-0 sm:ps-0">
                          <RelativeTime date={n.createdAt} label="تاريخ الإنشاء" />
                        {!n.isRead && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkOne(n.id)}
                            aria-label="تعليم كمقروء"
                          >
                            <Check className="w-4 h-4 ml-1" />
                            مقروء
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronRight className="w-4 h-4 ml-1" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground font-brm">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                التالي
                <ChevronLeft className="w-4 h-4 mr-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
