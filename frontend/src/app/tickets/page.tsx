"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { useTickets } from "@/hooks/useTickets";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TICKET_STATUS_LABELS, TICKET_TYPE_LABELS } from "@/lib/constants";
import { Plus, Search, User } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { CompanyLogo } from "@/components/shared/CompanyLogo";

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

const QUICK_STATUSES = [
  { key: "", label: "الكل" },
  { key: "NEW",               label: TICKET_STATUS_LABELS.NEW },
  { key: "IN_PROGRESS",       label: TICKET_STATUS_LABELS.IN_PROGRESS },
  { key: "AWAITING_TESTING",  label: TICKET_STATUS_LABELS.AWAITING_TESTING },
  { key: "COMPLETED",         label: TICKET_STATUS_LABELS.COMPLETED },
  { key: "CLOSED",            label: TICKET_STATUS_LABELS.CLOSED },
];

function FilterPill({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
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

export default function TicketsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeStatus, setActiveStatus] = useState("");
  const [activeCompany, setActiveCompany] = useState("");
  const { data, isLoading } = useTickets(filters);

  const { data: companies } = useQuery({
    queryKey: ["companies-list"],
    queryFn: () => api.get("/companies").then(r => r.data as any[]),
    staleTime: 60_000,
  });

  const canCreate = user?.role && !["SENIOR_MANAGEMENT", "DEVELOPER", "QA"].includes(user.role);

  const setFilter = (key: string, val: string) => {
    setFilters(prev =>
      val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
    );
  };

  const setStatusFilter = (status: string) => {
    setActiveStatus(status);
    setFilter("status", status);
  };

  const setCompanyFilter = (companyId: string) => {
    setActiveCompany(companyId);
    setFilter("companyId", companyId);
  };

  const companyList: any[] = Array.isArray(companies) ? companies : (companies as any)?.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="التذاكر"
        description={`${data?.total ?? 0} تذكرة`}
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
            // الشركات
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
      <div className="mb-6">
        <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          // الحالة
        </p>
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl w-fit" style={{ background: "var(--muted)" }}>
          {QUICK_STATUSES.map(({ key, label }) => (
            <FilterPill key={key} label={label} active={activeStatus === key} onClick={() => setStatusFilter(key)} />
          ))}
        </div>
      </div>

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
            const brmId = ticket.ticketNumber
              ? `BRM-${String(ticket.ticketNumber).padStart(4, "0")}`
              : null;

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
                          {brmId && (
                            <span className="font-brm text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                              {brmId}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{TICKET_TYPE_LABELS[ticket.type]}</span>
                        </div>
                        <h3 className="font-semibold truncate" style={{ color: "var(--foreground)" }}>{ticket.title}</h3>
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                            <User className="w-3 h-3" />
                            {ticket.creator?.firstName} {ticket.creator?.lastName}
                          </span>
                          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{ticket.system?.name}</span>
                          {ticket.company && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                              <CompanyLogo company={ticket.company} size="xs" />
                              {ticket.company.name}
                            </span>
                          )}
                          <RelativeTime date={ticket.createdAt} />
                        </div>
                      </div>
                      {ticket.assignments?.[0] && (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-indigo-600 text-sm shrink-0"
                          style={{ background: "rgba(79,70,229,0.1)" }}
                        >
                          {ticket.assignments[0].developer?.firstName?.[0]}
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
