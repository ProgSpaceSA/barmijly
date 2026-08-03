"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { useTickets } from "@/hooks/useTickets";
import { useAuthStore } from "@/store/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TICKET_TYPE_LABELS } from "@/lib/constants";
import { Search, User, Archive } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { CompanyLogo } from "@/components/shared/CompanyLogo";

const ALLOWED_ROLES = ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"];

const STATUS_BAR_COLORS: Record<string, string> = {
  DRAFT:                   "#94A3B8",
  NEW:                     "#3B82F6",
  AWAITING_INFO:           "#F59E0B",
  APPROVED:                "#10B981",
  REJECTED:                "#EF4444",
  SCHEDULED:               "#8B5CF6",
  IN_PROGRESS:             "#22C55E",
  AWAITING_TESTING:        "#06B6D4",
  AWAITING_OWNER_APPROVAL: "#14B8A6",
  COMPLETED:               "#10B981",
  CLOSED:                  "#6B7280",
};

export default function ArchivedTicketsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [filters, setFilters] = useState<Record<string, string>>({ isArchived: "true" });
  const [activeCompany, setActiveCompany] = useState("");
  const { data, isLoading } = useTickets(filters);

  const { data: companies } = useQuery({
    queryKey: ["companies-list"],
    queryFn: () => api.get("/companies").then(r => r.data as any[]),
    staleTime: 60_000,
  });

  if (user && !ALLOWED_ROLES.includes(user.role)) {
    router.replace("/tickets");
    return null;
  }

  const setFilter = (key: string, val: string) => {
    setFilters(prev =>
      val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
    );
  };

  const companyList: any[] = Array.isArray(companies) ? companies : (companies as any)?.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="الأرشيف"
        description={`${data?.total ?? 0} تذكرة مؤرشفة`}
      />

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-foreground)" }} />
        <Input
          placeholder="بحث في الأرشيف..."
          className="pr-9"
          onChange={e => setFilter("search", e.target.value)}
        />
      </div>

      {/* Company filter */}
      {companyList.length > 0 && (
        <div className="mb-6">
          <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            // الشركات
          </p>
          <div className="flex flex-wrap gap-1.5 p-1 rounded-xl w-fit" style={{ background: "var(--muted)" }}>
            <button
              onClick={() => { setActiveCompany(""); setFilter("companyId", ""); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: activeCompany === "" ? "var(--card)" : "transparent",
                color: activeCompany === "" ? "var(--foreground)" : "var(--muted-foreground)",
                boxShadow: activeCompany === "" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >الكل</button>
            {companyList.map((c: any) => (
              <button
                key={c.id}
                onClick={() => { setActiveCompany(c.id); setFilter("companyId", c.id); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: activeCompany === c.id ? "var(--card)" : "transparent",
                  color: activeCompany === c.id ? "var(--foreground)" : "var(--muted-foreground)",
                  boxShadow: activeCompany === c.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >{c.name}</button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <SkeletonList count={6} />
      ) : !data?.data?.length ? (
        <EmptyState
          title="لا توجد تذاكر مؤرشفة"
          command="list tickets --filter archived"
          description="لم يتم العثور على تذاكر مؤرشفة"
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
                    opacity: 0.85,
                  }}
                >
                  <div className="w-1 shrink-0 self-stretch" style={{ background: barColor, borderRadius: "0 4px 4px 0" }} />

                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                            <Archive className="w-3 h-3" /> مؤرشفة
                          </span>
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
                            {ticket.creator?.id === user?.id ? "أنت" : `${ticket.creator?.firstName} ${ticket.creator?.lastName}`}
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
