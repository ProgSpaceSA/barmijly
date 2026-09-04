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
import {
  TICKET_CREATED_BY_ME_LABEL,
  TICKET_MINE_LABEL,
  TICKET_STATUS_LABELS,
} from "@/lib/constants";
import { ticketStatusFilterKeys } from "@/lib/permissions";
import {
  TICKET_OVERDUE_KEY,
  canFilterCreatedByMe,
  emptyTicketListView,
  statusesParamToKey,
  ticketListDefaultView,
  ticketListQuery,
  ticketStatusShortcuts,
  type TicketListView,
} from "@/lib/ticket-list-filters";
import { PenLine, Plus, Search, User } from "lucide-react";
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
    ...ticketStatusShortcuts(role).map(({ key, label }) => ({ key, label })),
    ...statuses,
    { key: TICKET_OVERDUE_KEY, label: "متأخرة" },
  ];
}

function viewFromSearchParams(params: URLSearchParams, role: UserRole | undefined): { hasIntent: boolean; view: TicketListView } {
  const overdue = params.get("overdue") === "true";
  const mine = params.get("mine") === "true";
  const developerId = params.get("developerId") ?? "";
  const status = params.get("status") ?? "";
  const statuses = params.get("statuses") ?? "";
  const hasIntent = overdue || mine || Boolean(developerId) || Boolean(status) || Boolean(statuses);
  const activeStatus = overdue
    ? TICKET_OVERDUE_KEY
    : statuses
      ? statusesParamToKey(statuses, role)
      : status;
  return {
    hasIntent,
    view: {
      ...emptyTicketListView(),
      activeStatus,
      mineOnly: mine,
      developerId: mine ? "" : developerId,
    },
  };
}

function FilterPill({ label, active, onClick, icon, ariaLabel }: { label: string; active: boolean; onClick: () => void; icon?: React.ReactNode; ariaLabel?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
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
  const { user } = useAuthStore();
  const role = user?.role;
  const urlParsed = viewFromSearchParams(searchParams, role);
  const [override, setOverride] = useState<TicketListView | null>(null);
  const [searchFilters, setSearchFilters] = useState<Record<string, string>>({});
  const view = override ?? (urlParsed.hasIntent ? urlParsed.view : ticketListDefaultView(role));
  const filtersReady = urlParsed.hasIntent || Boolean(role);
  const filters = { ...ticketListQuery(view, role, user?.id), ...searchFilters };
  const { data, isLoading, isPending } = useTickets(filters, { enabled: filtersReady });

  const isDeveloper = role === "DEVELOPER";
  const canFilterByDeveloper = !isDeveloper;
  const showCreatedByMe = canFilterCreatedByMe(role);

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

  const canCreate = role && !["SENIOR_MANAGEMENT", "DEVELOPER", "QA"].includes(role);
  const showSkeleton = !filtersReady || isLoading || isPending;

  const dropPage = (prev: Record<string, string>) => {
    const next = { ...prev };
    delete next.page;
    return next;
  };

  const { search, onSearchChange } = useDebouncedSearch((value) =>
    setSearchFilters((prev) => {
      const next = dropPage(prev);
      if (value) next.search = value;
      else delete next.search;
      return next;
    }),
  );

  const setStatusFilter = (status: string) => {
    setOverride({ ...view, activeStatus: status });
    setSearchFilters(dropPage);
  };

  const setCompanyFilter = (companyId: string) => {
    setOverride({ ...view, activeCompany: companyId });
    setSearchFilters(dropPage);
  };

  const setAssignmentFilter = (next: { mine?: boolean; created?: boolean; developerId?: string }) => {
    setOverride({
      ...view,
      mineOnly: Boolean(next.mine),
      createdOnly: Boolean(next.created),
      developerId: next.developerId ?? "",
    });
    setSearchFilters(dropPage);
  };

  const setPage = (page: string) => {
    setSearchFilters((prev) => {
      const next = { ...prev };
      if (page && page !== "1") next.page = page;
      else delete next.page;
      return next;
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
            <FilterPill label="الكل" active={view.activeCompany === ""} onClick={() => setCompanyFilter("")} />
            {companyList.map((c: any) => (
              <FilterPill
                key={c.id}
                label={c.name}
                active={view.activeCompany === c.id}
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
          {statusFilterPills(role).map(({ key, label }) => (
            <FilterPill key={key || "all"} label={label} active={view.activeStatus === key} onClick={() => setStatusFilter(key)} />
          ))}
        </div>
      </div>

      {/* Assigned-to-me / my-tasks filter */}
      <div className="mb-3">
        <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          <CodeComment>الإسناد</CodeComment>
        </p>
        <div className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-fit max-w-full" style={{ background: "var(--muted)" }} role="group" aria-label="الإسناد">
          <FilterPill label="الكل" ariaLabel="كل التذاكر" active={!view.mineOnly && !view.createdOnly && !view.developerId} onClick={() => setAssignmentFilter({})} />
          <FilterPill
            label={TICKET_MINE_LABEL}
            active={view.mineOnly}
            onClick={() => setAssignmentFilter({ mine: true })}
            icon={<User className="w-3 h-3" />}
          />
          {showCreatedByMe && (
            <FilterPill
              label={TICKET_CREATED_BY_ME_LABEL}
              active={view.createdOnly}
              onClick={() => setAssignmentFilter({ created: true })}
              icon={<PenLine className="w-3 h-3" />}
            />
          )}
          {canFilterByDeveloper && developerList.map((dev) => {
            const name = [dev.firstName, dev.lastName].filter(Boolean).join(" ");
            return (
              <FilterPill
                key={dev.id}
                label={name}
                ariaLabel={`التذاكر المُسندة إلى ${name}`}
                active={view.developerId === dev.id}
                onClick={() => setAssignmentFilter({ developerId: dev.id })}
              />
            );
          })}
        </div>
      </div>

      {!showSkeleton && (
        <p className="mb-4 flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
            {data?.total ?? 0}
          </span>
          <span className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>تذكرة</span>
        </p>
      )}

      {showSkeleton ? (
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
                  onClick={() => setPage(String(p))}
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
