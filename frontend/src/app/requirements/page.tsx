"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, CircleAlert, Plus, Search, Ticket as TicketIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList, SkeletonStat } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import {
  RequirementListCard,
  type RequirementCardRequirement,
} from "@/components/meetings/RequirementListCard";
import { RequirementEditorDialog } from "@/components/meetings/RequirementEditorDialog";
import { PromoteRequirementDialog } from "@/components/meetings/PromoteRequirementDialog";
import { useRequirementActions, useRequirements } from "@/hooks/useRequirements";
import { useDebouncedSearch } from "@/hooks/useDebouncedValue";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  MEETING_LABELS,
  REQUIREMENT_SOURCE_LABELS,
  REQUIREMENT_STATUS_LABELS,
} from "@/lib/constants";

const STATUS_OPTIONS = [
  { value: "open", label: MEETING_LABELS.filterOpen },
  ...Object.entries(REQUIREMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const SOURCE_OPTIONS = Object.entries(REQUIREMENT_SOURCE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const MINE_OPTIONS = [{ value: "true", label: MEETING_LABELS.mineRequirements }];

const PIN_OPTIONS = [
  { value: "true", label: MEETING_LABELS.unpinnedOnly },
  { value: "false", label: MEETING_LABELS.pinnedOnly },
];

const ARCHIVE_OPTIONS = [
  { value: "false", label: MEETING_LABELS.activeOnly },
  { value: "true", label: MEETING_LABELS.archivedOnly },
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
  icon: typeof ClipboardList;
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

export default function RequirementsPage() {
  const router = useRouter();
  const { can: allowed } = usePermissions();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [mine, setMine] = useState("");
  const [pinned, setPinned] = useState("");
  const [archived, setArchived] = useState("");
  const [creating, setCreating] = useState(false);
  const [promoting, setPromoting] = useState<RequirementCardRequirement | null>(null);

  const { data, isLoading } = useRequirements(filters);
  const actions = useRequirementActions();
  const canCreate = allowed("requirement:create");
  const canPromote = allowed("requirement:promote");

  const { data: companiesRaw } = useQuery({
    queryKey: qk.companies.list(),
    queryFn: () => api.get("/companies").then((r) => r.data),
    staleTime: 60_000,
  });
  const companies = asList<{ id: string; name: string }>(companiesRaw);

  const setFilter = (key: string, value: string) =>
    setFilters((prev) =>
      value
        ? { ...prev, [key]: value, page: "1" }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key && k !== "page")),
    );

  const { search, onSearchChange } = useDebouncedSearch((value) =>
    setFilter("search", value),
  );

  /** «تحتاج متابعة» is a set of statuses, so it and `status` are exclusive. */
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

  const rows: RequirementCardRequirement[] = data?.data ?? [];
  const unpinned = rows.filter((r) => !r.systemId).length;
  const converted = rows.filter((r) => r.status === "CONVERTED").length;

  return (
    <AppShell>
      <PageHeader
        title={MEETING_LABELS.requirementsTitle}
        description={MEETING_LABELS.requirementsDescription}
        action={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="ml-2 h-4 w-4" aria-hidden /> {MEETING_LABELS.newRequirement}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
        ) : (
          <>
            <StatTile
              label={MEETING_LABELS.total}
              value={data?.total ?? 0}
              tone="#4F46E5"
              icon={ClipboardList}
            />
            <StatTile
              label={MEETING_LABELS.openRequirements}
              value={data?.openCount ?? 0}
              tone="#F97316"
              icon={CircleAlert}
              hint={MEETING_LABELS.openHint}
            />
            <StatTile
              label={MEETING_LABELS.awaitingSystem}
              value={unpinned}
              tone="#F59E0B"
              icon={CircleAlert}
              alert={unpinned > 0}
            />
            <StatTile
              label={MEETING_LABELS.converted}
              value={converted}
              tone="#10B981"
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
          placeholder={MEETING_LABELS.searchRequirements}
          aria-label={MEETING_LABELS.searchRequirements}
          className="ps-9"
          value={search}
          onChange={onSearchChange}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <ThemeSelect
          value={companyId}
          onChange={(v) => {
            setCompanyId(v);
            setFilter("companyId", v);
          }}
          placeholder={MEETING_LABELS.filterCompany}
          aria-label={MEETING_LABELS.filterCompany}
          triggerClassName="h-9"
          items={companies.map((c) => ({ value: c.id, label: c.name }))}
        />
        <ThemeSelect
          value={status}
          onChange={setStatusFilter}
          placeholder={MEETING_LABELS.filterStatus}
          aria-label={MEETING_LABELS.filterStatus}
          triggerClassName="h-9"
          items={STATUS_OPTIONS}
        />
        <ThemeSelect
          value={source}
          onChange={(v) => {
            setSource(v);
            setFilter("source", v);
          }}
          placeholder={MEETING_LABELS.filterSource}
          aria-label={MEETING_LABELS.filterSource}
          triggerClassName="h-9"
          items={SOURCE_OPTIONS}
        />
        <ThemeSelect
          value={pinned}
          onChange={(v) => {
            setPinned(v);
            setFilter("unpinned", v);
          }}
          placeholder={MEETING_LABELS.filterSystem}
          aria-label={MEETING_LABELS.filterSystem}
          triggerClassName="h-9"
          items={PIN_OPTIONS}
        />
        <ThemeSelect
          value={mine}
          onChange={(v) => {
            setMine(v);
            setFilter("mine", v);
          }}
          placeholder={MEETING_LABELS.filterAll}
          aria-label={MEETING_LABELS.mineRequirements}
          triggerClassName="h-9"
          items={MINE_OPTIONS}
        />
        <ThemeSelect
          value={archived}
          onChange={(v) => {
            setArchived(v);
            setFilter("isArchived", v);
          }}
          placeholder={MEETING_LABELS.filterArchived}
          aria-label={MEETING_LABELS.filterArchived}
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
            {MEETING_LABELS.requirementCount}
          </span>
        </p>
      )}

      {isLoading ? (
        <SkeletonList count={5} />
      ) : !rows.length ? (
        <EmptyState
          title={MEETING_LABELS.noRequirements}
          command="list requirements --open"
          description={MEETING_LABELS.noRequirementsHint}
          action={
            canCreate
              ? { label: MEETING_LABELS.newRequirement, onClick: () => setCreating(true) }
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((requirement) => (
            <RequirementListCard
              key={requirement.id}
              requirement={requirement}
              canPromote={canPromote}
              promoting={
                actions.promote.isPending && actions.promote.variables?.id === requirement.id
              }
              onPromote={(requirementId) => {
                const row = rows.find((r) => r.id === requirementId);
                if (row) setPromoting(row);
              }}
              onOpen={(requirementId) => router.push(`/requirements/${requirementId}`)}
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

      {creating && <RequirementEditorDialog onClose={() => setCreating(false)} />}

      {promoting && (
        <PromoteRequirementDialog
          requirement={promoting}
          pending={actions.promote.isPending}
          onClose={() => setPromoting(null)}
          onConfirm={(data) => {
            void actions.promote
              .mutateAsync({ id: promoting.id, ...data })
              .then((result: { ticket: { id: string } }) => {
                setPromoting(null);
                router.push(`/tickets/${result.ticket.id}`);
              });
          }}
        />
      )}
    </AppShell>
  );
}
