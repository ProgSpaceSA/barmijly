"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { TicketCodeBadge } from "@/components/shared/TicketCodeBadge";
import { useTickets } from "@/hooks/useTickets";
import { useAuthStore, type UserRole } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TICKET_MINE_LABEL, TICKET_STATUS_LABELS, TICKET_TYPE_LABELS } from "@/lib/constants";
import { ticketStatusFilterKeys } from "@/lib/permissions";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Plus, Search, User, Clock } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { CodeComment } from "@/components/shared/CodeComment";

const DONE_STATUSES = new Set(["CLOSED", "COMPLETED", "REJECTED"]);

function isOverdue(ticket: { estimatedDeadline?: string | null; status: string }) {
  if (!ticket.estimatedDeadline || DONE_STATUSES.has(ticket.status)) return false;
  return new Date(ticket.estimatedDeadline) < new Date();
}

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

function statusFilterPills(role: UserRole | undefined) {
  const keys = ticketStatusFilterKeys(role);
  const statuses = (keys === null
    ? Object.entries(TICKET_STATUS_LABELS)
    : keys.map((key) => [key, TICKET_STATUS_LABELS[key]] as const)
  ).map(([key, label]) => ({ key, label }));
  return [
    { key: "", label: "الكل" },
    ...statuses,
    { key: "OVERDUE", label: "متأخرة" },
  ];
}

function FilterPill({ label, active, onClick, icon, ariaLabel }: { label: string; active: boolean; onClick: () => void; icon?: React.ReactNode; ariaLabel?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
      style={{
        background: active ? "var(--card)" : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {icon}{label}
    </button>
  );
}

function TicketsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const overdueOnLoad = searchParams.get("overdue") === "true";
  const mineOnLoad = searchParams.get("mine") === "true";
  const { user } = useAuthStore();
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (overdueOnLoad) initial.overdue = "true";
    if (mineOnLoad) initial.mine = "true";
    return initial;
  });
  const [activeStatus, setActiveStatus] = useState(() =>
    overdueOnLoad ? "OVERDUE" : ""
  );
  const [activeCompany, setActiveCompany] = useState("");
  const [mineOnly, setMineOnly] = useState(mineOnLoad);
  const { data, isLoading } = useTickets(filters);

  const isDeveloper = user?.role === "DEVELOPER";

  const { data: companies } = useQuery({
    queryKey: ["companies-list"],
    queryFn: () => api.get("/companies").then(r => r.data as any[]),
    staleTime: 60_000,
    enabled: !isDeveloper,
  });

  // For developers: derive visible companies from their own ticket scope (no company filter, high limit)
  const { data: devBaseTickets } = useQuery({
    queryKey: ["tickets-dev-base"],
    queryFn: () => api.get("/tickets", { params: { limit: 200 } }).then(r => r.data),
    staleTime: 60_000,
    enabled: isDeveloper,
  });

  const canCreate = user?.role && !["SENIOR_MANAGEMENT", "DEVELOPER", "QA"].includes(user.role);

  const setFilter = (key: string, val: string) => {
    setFilters(prev =>
      val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
    );
  };

  const setStatusFilter = (status: string) => {
    setActiveStatus(status);
    setFilters(prev => {
      const next: Record<string, string> = { ...prev };
      delete next.status;
      delete next.overdue;
      if (status === "OVERDUE") next.overdue = "true";
      else if (status) next.status = status;
      return next;
    });
  };

  const setCompanyFilter = (companyId: string) => {
    setActiveCompany(companyId);
    setFilter("companyId", companyId);
  };

  const setMineFilter = (on: boolean) => {
    setMineOnly(on);
    setFilter("mine", on ? "true" : "");
  };

  const companyList: any[] = isDeveloper
    ? Array.from(
        new Map(
          ((devBaseTickets?.data ?? []) as any[])
            .filter((t: any) => t.company?.id)
            .map((t: any) => [t.company.id, t.company])
        ).values()
      )
    : Array.isArray(companies) ? companies : (companies as any)?.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="التذاكر"
        action={canCreate ? (
          <Button onClick={() => router.push("/tickets/new")}>
            <Plus className="w-4 h-4 ml-2" /> تذكرة جديدة
          </Button>
        ) : undefined}
      />

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-foreground)" }} />
        <Input
          placeholder="بحث في التذاكر... (أو Ctrl+K)"
          className="pr-9"
          onChange={e => setFilter("search", e.target.value)}
        />
      </div>

      {/* Company filter */}
      {companyList.length > 0 && (
        <div className="mb-3">
          <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            <CodeComment>الشركات</CodeComment>
          </p>
          <div className="flex flex-wrap gap-1.5 p-1 rounded-xl w-fit" style={{ background: "var(--muted)" }}>
            <FilterPill label="الكل" active={activeCompany === ""} onClick={() => setCompanyFilter("")} />
            {companyList.map((c: any) => (
              <FilterPill
                key={c.id}
                label={c.name}
                active={activeCompany === c.id}
                onClick={() => setCompanyFilter(c.id)}
                icon={<CompanyLogo company={c} size="xs" />}
              />
            ))}
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="mb-3">
        <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          <CodeComment>الحالة</CodeComment>
        </p>
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl w-fit" style={{ background: "var(--muted)" }}>
          {statusFilterPills(user?.role).map(({ key, label }) => (
            <FilterPill key={key} label={label} active={activeStatus === key} onClick={() => setStatusFilter(key)} />
          ))}
        </div>
      </div>

      {/* Assigned-to-me / my-tasks filter */}
      <div className="mb-3">
        <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          <CodeComment>الإسناد</CodeComment>
        </p>
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl w-fit" style={{ background: "var(--muted)" }} role="group" aria-label="الإسناد">
          <FilterPill label="الكل" ariaLabel="كل التذاكر" active={!mineOnly} onClick={() => setMineFilter(false)} />
          <FilterPill
            label={TICKET_MINE_LABEL}
            active={mineOnly}
            onClick={() => setMineFilter(true)}
            icon={<User className="w-3 h-3" />}
          />
        </div>
      </div>

      {!isLoading && (
        <p className="mb-4 flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
            {data?.total ?? 0}
          </span>
          <span className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>تذكرة</span>
        </p>
      )}

      {isLoading ? (
        <SkeletonList count={6} />
      ) : !data?.data?.length ? (
        <EmptyState
          title="لا توجد تذاكر"
          command="list tickets --filter active"
          description="لم يتم العثور على تذاكر بهذه الفلاتر"
          action={canCreate ? { label: "إنشاء تذكرة", onClick: () => router.push("/tickets/new") } : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {data.data.map((ticket: any) => {
            const barColor = STATUS_BAR_COLORS[ticket.status] ?? "#94A3B8";
            const assignedDev = ticket.assignments?.[0]?.developer;
            const assignedDevName = [assignedDev?.firstName, assignedDev?.lastName]
              .filter(Boolean)
              .join(" ");
            const assignedDevLabel = assignedDevName
              ? `المطور المُكلَّف: ${assignedDevName}`
              : "المطور المُكلَّف";

            return (
              <Link key={ticket.id} href={`/tickets/${ticket.id}`} style={{ display: "block" }}>
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
                          <StatusBadge status={ticket.status} />
                          <PriorityBadge priority={ticket.finalPriority || ticket.priority} />
                          <TicketCodeBadge ticketNumber={ticket.ticketNumber} />
                          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{TICKET_TYPE_LABELS[ticket.type]}</span>
                        </div>
                        <h3 className="font-semibold truncate" style={{ color: "var(--foreground)" }}>{ticket.title}</h3>
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span
                            className="flex items-center gap-1 text-xs cursor-help"
                            title="طالب التذكرة"
                            aria-label="طالب التذكرة"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            <User className="w-3 h-3" aria-hidden />
                            {ticket.creator?.id === user?.id ? "أنت" : `${ticket.creator?.firstName} ${ticket.creator?.lastName}`}
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
                              التسليم: {format(new Date(ticket.estimatedDeadline), "d MMM yyyy", { locale: ar })}
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
          })}

          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              {Array.from({ length: data.totalPages }, (_, i) => i + 1).map(p => (
                <Button
                  key={p}
                  variant={String(p) === (filters.page || "1") ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("page", String(p))}
                >
                  {p}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={
      <AppShell>
        <SkeletonList count={6} />
      </AppShell>
    }>
      <TicketsPageContent />
    </Suspense>
  );
}
