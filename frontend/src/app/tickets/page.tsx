"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { TicketListCard } from "@/components/shared/TicketListCard";
import { useTickets } from "@/hooks/useTickets";
import { useDebouncedSearch } from "@/hooks/useDebouncedValue";
import { useAuthStore, type UserRole } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TICKET_MINE_LABEL, TICKET_STATUS_LABELS } from "@/lib/constants";
import { ticketStatusFilterKeys } from "@/lib/permissions";
import { Plus, Search, User } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { CodeComment } from "@/components/shared/CodeComment";

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
  const developerOnLoad = searchParams.get("developerId") ?? "";
  const { user } = useAuthStore();
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (overdueOnLoad) initial.overdue = "true";
    if (mineOnLoad) initial.mine = "true";
    else if (developerOnLoad) initial.developerId = developerOnLoad;
    return initial;
  });
  const [activeStatus, setActiveStatus] = useState(() =>
    overdueOnLoad ? "OVERDUE" : ""
  );
  const [activeCompany, setActiveCompany] = useState("");
  const [mineOnly, setMineOnly] = useState(mineOnLoad);
  const [developerId, setDeveloperId] = useState(mineOnLoad ? "" : developerOnLoad);
  const { data, isLoading } = useTickets(filters);

  const isDeveloper = user?.role === "DEVELOPER";
  const canFilterByDeveloper = !isDeveloper;

  const { data: companies } = useQuery({
    queryKey: qk.companies.list(),
    queryFn: () => api.get("/companies").then(r => r.data as any[]),
    staleTime: 60_000,
    enabled: !isDeveloper,
  });

  const { data: developers } = useQuery({
    queryKey: qk.users.developers(),
    queryFn: () => api.get("/users/developers").then(r => r.data as { id: string; firstName: string; lastName: string }[]),
    staleTime: 60_000,
    enabled: canFilterByDeveloper,
  });

  // For developers: derive visible companies from their own ticket scope (no company filter, high limit)
  const { data: devBaseTickets } = useQuery({
    queryKey: qk.tickets.devBase(),
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

  const { search, onSearchChange } = useDebouncedSearch((value) =>
    setFilter("search", value),
  );

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

  const setAssignmentFilter = (next: { mine?: boolean; developerId?: string }) => {
    const mine = Boolean(next.mine);
    const nextDeveloperId = next.developerId ?? "";
    setMineOnly(mine);
    setDeveloperId(nextDeveloperId);
    setFilters(prev => {
      const updated: Record<string, string> = { ...prev };
      if (mine) updated.mine = "true";
      else delete updated.mine;
      if (nextDeveloperId) updated.developerId = nextDeveloperId;
      else delete updated.developerId;
      return updated;
    });
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

  const developerList = Array.isArray(developers) ? developers : [];

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
          value={search}
          onChange={onSearchChange}
        />
      </div>

      {/* Company filter */}
      {companyList.length > 0 && (
        <div className="mb-3">
          <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            <CodeComment>الشركات</CodeComment>
          </p>
          <div className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-fit max-w-full" style={{ background: "var(--muted)" }}>
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
        <div className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-fit max-w-full" style={{ background: "var(--muted)" }}>
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
        <div className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-fit max-w-full" style={{ background: "var(--muted)" }} role="group" aria-label="الإسناد">
          <FilterPill label="الكل" ariaLabel="كل التذاكر" active={!mineOnly && !developerId} onClick={() => setAssignmentFilter({})} />
          <FilterPill
            label={TICKET_MINE_LABEL}
            active={mineOnly}
            onClick={() => setAssignmentFilter({ mine: true })}
            icon={<User className="w-3 h-3" />}
          />
          {canFilterByDeveloper && developerList.map((dev) => {
            const name = [dev.firstName, dev.lastName].filter(Boolean).join(" ");
            return (
              <FilterPill
                key={dev.id}
                label={name}
                ariaLabel={`التذاكر المُسندة إلى ${name}`}
                active={developerId === dev.id}
                onClick={() => setAssignmentFilter({ developerId: dev.id })}
              />
            );
          })}
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
          {data.data.map((ticket: any) => (
            <TicketListCard key={ticket.id} ticket={ticket} currentUserId={user?.id} />
          ))}

          {data.totalPages > 1 && (
            <div className="flex flex-wrap justify-center gap-2 pt-4">
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
