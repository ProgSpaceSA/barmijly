"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bug as BugIcon, CircleAlert, Plus, Search, Ticket as TicketIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList, SkeletonStat } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { BugListCard, type BugCardBug } from "@/components/testing/BugListCard";
import { BugEditorDialog } from "@/components/testing/BugEditorDialog";
import { PromoteBugDialog } from "@/components/testing/PromoteBugDialog";
import { useBugActions, useBugs } from "@/hooks/useBugs";
import { useDebouncedSearch } from "@/hooks/useDebouncedValue";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  BUG_SEVERITY_LABELS,
  BUG_STATUS_LABELS,
  TESTING_LABELS,
} from "@/lib/constants";

const SEVERITY_OPTIONS = Object.entries(BUG_SEVERITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const STATUS_OPTIONS = [
  { value: "open", label: TESTING_LABELS.filterOpenBugs },
  ...Object.entries(BUG_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const LINK_OPTIONS = [
  { value: "false", label: TESTING_LABELS.noTicket },
  { value: "true", label: TESTING_LABELS.hasTicket },
];

const ASSIGNEE_OPTIONS = [{ value: "true", label: TESTING_LABELS.minePlain }];

const ARCHIVE_OPTIONS = [
  { value: "false", label: TESTING_LABELS.activeOnly },
  { value: "true", label: TESTING_LABELS.archivedOnly },
];

function StatTile({
  label,
  value,
  tone,
  icon: Icon,
  alert,
  hint,
}: {
  label: string;
  value: number;
  tone: string;
  icon: typeof BugIcon;
  alert?: boolean;
  hint?: string;
}) {
  return (
    <div
      className="brm-stat flex items-start justify-between gap-2"
      data-alert={alert ? "true" : undefined}
      style={{ ["--stat-tone" as string]: tone }}
      title={hint}
    >
      <div className="min-w-0">
        <p className="brm-stat-label truncate">{label}</p>
        <p className="brm-stat-value tabular-nums">{value}</p>
      </div>
      <span className="brm-stat-icon">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
    </div>
  );
}

function asList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

export default function BugsPage() {
  const router = useRouter();
  const { can: allowed } = usePermissions();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [link, setLink] = useState("");
  const [mine, setMine] = useState("");
  const [archived, setArchived] = useState("");
  const [systemId, setSystemId] = useState("");
  const [suiteId, setSuiteId] = useState("");
  const [creating, setCreating] = useState(false);
  const [promoteBug, setPromoteBug] = useState<BugCardBug | null>(null);

  const { data, isLoading } = useBugs(filters);
  const actions = useBugActions();
  const canPromote = allowed("bug:promote");
  const canCreate = allowed("bug:create");
  const canEdit = allowed("bug:create");
  const showingArchived = filters.isArchived === "true";

  const { data: systemsRaw } = useQuery({
    queryKey: qk.systems.all,
    queryFn: () => api.get("/systems").then((r) => r.data),
    staleTime: 60_000,
  });
  const systems = asList<{ id: string; name: string }>(systemsRaw);

  const suiteFilters = useMemo((): Record<string, string> => (
    systemId ? { systemId, limit: "100" } : {}
  ), [systemId]);
  const { data: suitesRaw } = useQuery({
    queryKey: qk.suites.list(suiteFilters),
    queryFn: () => api.get("/test-suites", { params: suiteFilters }).then((r) => r.data),
    enabled: !!systemId,
    staleTime: 60_000,
  });
  const suites = asList<{ id: string; title: string }>(suitesRaw);

  const setFilter = (key: string, value: string) =>
    setFilters((prev) =>
      value
        ? { ...prev, [key]: value, page: "1" }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key && k !== "page")),
    );

  const { search, onSearchChange } = useDebouncedSearch((value) =>
    setFilter("search", value),
  );

  const setStatusFilter = (value: string) => {
    setStatus(value);
    setFilters((prev) => {
      if (!value) {
        return Object.fromEntries(
          Object.entries(prev).filter(([k]) => k !== "status" && k !== "open" && k !== "page"),
        );
      }
      const next: Record<string, string> = { ...prev, page: "1" };
      delete next.status;
      delete next.open;
      if (value === "open") next.open = "true";
      else next.status = value;
      return next;
    });
  };

  const setSystemFilter = (next: string) => {
    setSystemId(next);
    setSuiteId("");
    setFilters((prev) => {
      const nextFilters: Record<string, string> = { ...prev, page: "1" };
      delete nextFilters.suiteId;
      if (next) nextFilters.systemId = next;
      else delete nextFilters.systemId;
      return nextFilters;
    });
  };

  const setSuiteFilter = (next: string) => {
    setSuiteId(next);
    setFilter("suiteId", next);
  };

  const rows: BugCardBug[] = data?.data ?? [];
  const blockers = rows.filter((b) => b.severity === "BLOCKER").length;
  const unpromoted = rows.filter((b) => !b.ticketId).length;

  return (
    <AppShell>
      <PageHeader
        title={TESTING_LABELS.bugsTitle}
        action={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="ml-2 h-4 w-4" aria-hidden /> {TESTING_LABELS.newBug}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <StatTile label={TESTING_LABELS.total} value={data?.total ?? 0} tone="#4F46E5" icon={BugIcon} />
            <StatTile
              label={TESTING_LABELS.openBugs}
              value={data?.openCount ?? 0}
              tone="#F97316"
              icon={CircleAlert}
              hint={TESTING_LABELS.openBugsHint}
            />
            <StatTile
              label={TESTING_LABELS.blockers}
              value={blockers}
              tone="#EF4444"
              icon={CircleAlert}
              alert={blockers > 0}
            />
            <StatTile
              label={TESTING_LABELS.unpromoted}
              value={unpromoted}
              tone="#0EA5E9"
              icon={TicketIcon}
            />
          </>
        )}
      </div>

      <div className="relative mb-3">
        <Search
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ insetInlineStart: 12, color: "var(--muted-foreground)" }}
          aria-hidden
        />
        <Input
          placeholder={TESTING_LABELS.searchBugs}
          aria-label={TESTING_LABELS.searchBugs}
          className="ps-9"
          value={search}
          onChange={onSearchChange}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <ThemeSelect
          value={systemId}
          onChange={setSystemFilter}
          placeholder={TESTING_LABELS.filterSystem}
          aria-label={TESTING_LABELS.filterSystem}
          triggerClassName="h-9"
          items={systems.map((s) => ({ value: s.id, label: s.name }))}
        />
        <ThemeSelect
          value={suiteId}
          onChange={setSuiteFilter}
          placeholder={
            systemId ? TESTING_LABELS.filterSuite : TESTING_LABELS.pickSystemFirst
          }
          aria-label={TESTING_LABELS.filterSuite}
          triggerClassName="h-9"
          disabled={!systemId}
          items={suites.map((s) => ({ value: s.id, label: s.title }))}
        />
        <ThemeSelect
          value={severity}
          onChange={(v) => {
            setSeverity(v);
            setFilter("severity", v);
          }}
          placeholder={TESTING_LABELS.filterSeverity}
          aria-label={TESTING_LABELS.filterSeverity}
          triggerClassName="h-9"
          items={SEVERITY_OPTIONS}
        />
        <ThemeSelect
          value={status}
          onChange={setStatusFilter}
          placeholder={TESTING_LABELS.filterStatus}
          aria-label={TESTING_LABELS.filterStatus}
          triggerClassName="h-9"
          items={STATUS_OPTIONS}
        />
        <ThemeSelect
          value={link}
          onChange={(v) => {
            setLink(v);
            setFilter("hasTicket", v);
          }}
          placeholder={TESTING_LABELS.filterLink}
          aria-label={TESTING_LABELS.filterLink}
          triggerClassName="h-9"
          items={LINK_OPTIONS}
        />
        <ThemeSelect
          value={mine}
          onChange={(v) => {
            setMine(v);
            setFilter("mine", v);
          }}
          placeholder={TESTING_LABELS.filterAll}
          aria-label={TESTING_LABELS.filterAssignee}
          triggerClassName="h-9"
          items={ASSIGNEE_OPTIONS}
        />
        <ThemeSelect
          value={archived}
          onChange={(v) => {
            setArchived(v);
            setFilter("isArchived", v);
          }}
          placeholder={TESTING_LABELS.filterArchived}
          aria-label={TESTING_LABELS.filterArchived}
          triggerClassName="h-9"
          items={ARCHIVE_OPTIONS}
        />
      </div>

      {!isLoading && (
        <p className="mb-4 flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
            {data?.total ?? 0}
          </span>
          <span className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            {TESTING_LABELS.bugCount}
          </span>
        </p>
      )}

      {isLoading ? (
        <SkeletonList count={5} />
      ) : !rows.length ? (
        <EmptyState
          title={TESTING_LABELS.noBugs}
          command="list bugs --status open"
          description={TESTING_LABELS.noBugsHint}
          action={
            canCreate
              ? { label: TESTING_LABELS.newBug, onClick: () => setCreating(true) }
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((bug) => (
            <BugListCard
              key={bug.id}
              bug={bug}
              canPromote={canPromote && !showingArchived}
              canUnarchive={canEdit && showingArchived}
              unarchiving={
                actions.unarchive.isPending && actions.unarchive.variables === bug.id
              }
              promoting={actions.promote.isPending && actions.promote.variables?.id === bug.id}
              onPromote={(bugId) => {
                const row = rows.find((b) => b.id === bugId);
                if (row) setPromoteBug(row);
              }}
              onUnarchive={(bugId) => {
                void actions.unarchive.mutateAsync(bugId);
              }}
              onOpen={(id) => router.push(`/bugs/${id}`)}
            />
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

      {creating && <BugEditorDialog onClose={() => setCreating(false)} />}

      {promoteBug && (
        <PromoteBugDialog
          bug={promoteBug}
          pending={actions.promote.isPending}
          onClose={() => setPromoteBug(null)}
          onConfirm={(title) => {
            void actions.promote
              .mutateAsync({ id: promoteBug.id, title })
              .then((result: { ticket: { id: string } }) => {
                setPromoteBug(null);
                router.push(`/tickets/${result.ticket.id}`);
              });
          }}
        />
      )}
    </AppShell>
  );
}
