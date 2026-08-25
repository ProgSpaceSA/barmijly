"use client";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { SuiteListCard } from "@/components/testing/SuiteListCard";
import { SuiteEditorDialog } from "@/components/testing/SuiteEditorDialog";
import { useTestSuites } from "@/hooks/useTestSuites";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth";
import { TESTING_LABELS, TEST_STATE_LABELS } from "@/lib/constants";

const STATE_OPTIONS = [
  { value: "DRAFT", label: TEST_STATE_LABELS.DRAFT },
  { value: "ACTIVE", label: TEST_STATE_LABELS.ACTIVE },
  { value: "ARCHIVED", label: TEST_STATE_LABELS.ARCHIVED },
];

const HEALTH_OPTIONS = [
  { value: "failing", label: TESTING_LABELS.healthFailing },
  { value: "open-bugs", label: TESTING_LABELS.healthOpenBugs },
  { value: "not-run", label: TESTING_LABELS.healthNotRun },
];

const OWNER_OPTIONS = [{ value: "true", label: TESTING_LABELS.mine }];

function SuitesPageContent() {
  const { user } = useAuthStore();
  const { can: allowed } = usePermissions();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [state, setState] = useState("");
  const [health, setHealth] = useState("");
  const [company, setCompany] = useState("");
  const [systemId, setSystemId] = useState("");
  const [mine, setMine] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);

  const { data, isLoading } = useTestSuites(filters);
  const canAuthor = allowed("test:author");

  const { data: companies } = useQuery({
    queryKey: qk.companies.list(),
    queryFn: () => api.get("/companies").then((r) => r.data),
    staleTime: 60_000,
  });
  const companyList: { id: string; name: string; logoUrl?: string | null }[] = Array.isArray(
    companies,
  )
    ? companies
    : (companies?.data ?? []);

  const { data: systemsRaw } = useQuery({
    queryKey: company
      ? qk.systems.byCompany(company)
      : qk.systems.all,
    queryFn: () =>
      api
        .get("/systems", { params: company ? { companyId: company } : undefined })
        .then((r) => r.data),
    staleTime: 60_000,
  });
  const systems: { id: string; name: string }[] = Array.isArray(systemsRaw)
    ? systemsRaw
    : (systemsRaw?.data ?? []);

  const setFilter = (key: string, value: string) =>
    setFilters((prev) =>
      value
        ? { ...prev, [key]: value, page: "1" }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)),
    );

  const setCompanyFilter = (next: string) => {
    setCompany(next);
    setSystemId("");
    setFilters((prev) => {
      const nextFilters: Record<string, string> = { ...prev, page: "1" };
      delete nextFilters.systemId;
      if (next) nextFilters.companyId = next;
      else delete nextFilters.companyId;
      return nextFilters;
    });
  };

  const setSystemFilter = (next: string) => {
    setSystemId(next);
    setFilter("systemId", next);
  };

  const setStateFilter = (key: string) => {
    setState(key);
    setFilters((prev) => {
      const next: Record<string, string> = { ...prev, page: "1" };
      delete next.state;
      delete next.isArchived;
      if (key === "ARCHIVED") next.isArchived = "true";
      else if (key) next.state = key;
      return next;
    });
  };

  return (
    <AppShell>
      <PageHeader
        title={TESTING_LABELS.suitesTitle}
        description={TESTING_LABELS.suitesDescription}
        action={
          canAuthor ? (
            <Button onClick={() => setEditorOpen(true)}>
              <Plus className="ml-2 h-4 w-4" aria-hidden /> {TESTING_LABELS.newSuite}
            </Button>
          ) : undefined
        }
      />

      <div className="relative mb-3">
        <Search
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ insetInlineStart: 12, color: "var(--muted-foreground)" }}
          aria-hidden
        />
        <Input
          placeholder={TESTING_LABELS.searchSuites}
          aria-label={TESTING_LABELS.searchSuites}
          className="ps-9"
          onChange={(e) => setFilter("search", e.target.value)}
        />
      </div>

      {/* One compact row of selects — the old four pill rails ate half the page. */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {companyList.length > 0 && (
          <ThemeSelect
            value={company}
            onChange={setCompanyFilter}
            placeholder={TESTING_LABELS.filterCompanies}
            aria-label={TESTING_LABELS.filterCompanies}
            triggerClassName="h-9"
            items={companyList.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <ThemeSelect
          value={systemId}
          onChange={setSystemFilter}
          placeholder={TESTING_LABELS.filterSystem}
          aria-label={TESTING_LABELS.filterSystem}
          triggerClassName="h-9"
          items={systems.map((s) => ({ value: s.id, label: s.name }))}
        />
        <ThemeSelect
          value={state}
          onChange={setStateFilter}
          placeholder={TESTING_LABELS.filterState}
          aria-label={TESTING_LABELS.filterState}
          triggerClassName="h-9"
          items={STATE_OPTIONS}
        />
        <ThemeSelect
          value={health}
          onChange={(v) => {
            setHealth(v);
            setFilter("health", v);
          }}
          placeholder={TESTING_LABELS.filterHealth}
          aria-label={TESTING_LABELS.filterHealth}
          triggerClassName="h-9"
          items={HEALTH_OPTIONS}
        />
        <ThemeSelect
          value={mine}
          onChange={(v) => {
            setMine(v);
            setFilter("mine", v);
          }}
          placeholder={TESTING_LABELS.filterOwner}
          aria-label={TESTING_LABELS.filterOwner}
          triggerClassName="h-9"
          items={OWNER_OPTIONS}
        />
      </div>

      {!isLoading && (
        <p className="mb-4 flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
            {data?.total ?? 0}
          </span>
          <span className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            {TESTING_LABELS.suiteCount}
          </span>
        </p>
      )}

      {isLoading ? (
        <SkeletonList count={5} />
      ) : !data?.data?.length ? (
        <EmptyState
          title={TESTING_LABELS.noCases}
          command="list test-suites"
          description={TESTING_LABELS.noBugsHint}
          action={
            canAuthor ? { label: TESTING_LABELS.newSuite, onClick: () => setEditorOpen(true) } : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data.data.map((suite: Parameters<typeof SuiteListCard>[0]["suite"]) => (
            <SuiteListCard key={suite.id} suite={suite} currentUserId={user?.id} />
          ))}

          {data.totalPages > 1 && (
            <div className="flex flex-wrap justify-center gap-2 pt-4">
              {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
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

      {editorOpen && <SuiteEditorDialog onClose={() => setEditorOpen(false)} />}
    </AppShell>
  );
}

export default function TestSuitesPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <SkeletonList count={5} />
        </AppShell>
      }
    >
      <SuitesPageContent />
    </Suspense>
  );
}
