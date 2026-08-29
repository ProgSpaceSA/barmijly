"use client";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { TicketListCard } from "@/components/shared/TicketListCard";
import { useTickets } from "@/hooks/useTickets";
import { useDebouncedSearch } from "@/hooks/useDebouncedValue";
import { useAuthStore } from "@/store/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { CodeComment } from "@/components/shared/CodeComment";

export default function ArchivedTicketsPage() {
  const { user } = useAuthStore();
  const [filters, setFilters] = useState<Record<string, string>>({ isArchived: "true" });
  const [activeCompany, setActiveCompany] = useState("");
  const { data, isLoading } = useTickets(filters);

  const { data: companies } = useQuery({
    queryKey: qk.companies.list(),
    queryFn: () => api.get("/companies").then(r => r.data as any[]),
    staleTime: 60_000,
  });

  const setFilter = (key: string, val: string) => {
    setFilters(prev =>
      val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
    );
  };

  const { search, onSearchChange } = useDebouncedSearch((value) =>
    setFilter("search", value),
  );

  const companyList: any[] = Array.isArray(companies) ? companies : (companies as any)?.data ?? [];

  return (
    <AppShell requires="ticket:read-archived">
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
          value={search}
          onChange={onSearchChange}
        />
      </div>

      {/* Company filter */}
      {companyList.length > 0 && (
        <div className="mb-6">
          <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            <CodeComment>الشركات</CodeComment>
          </p>
          <div className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-fit max-w-full" style={{ background: "var(--muted)" }}>
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
          {data.data.map((ticket: any) => (
            <TicketListCard key={ticket.id} ticket={ticket} currentUserId={user?.id} archived />
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
