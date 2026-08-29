"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarDays, ListChecks, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList, SkeletonStat } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { MeetingListCard, type MeetingCardMeeting } from "@/components/meetings/MeetingListCard";
import { MeetingEditorDialog } from "@/components/meetings/MeetingEditorDialog";
import { useMeetings } from "@/hooks/useMeetings";
import { useDebouncedSearch } from "@/hooks/useDebouncedValue";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  MEETING_LABELS,
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
} from "@/lib/constants";
import {
  customMeetingDateRange,
  meetingDateRange,
  type MeetingDatePreset,
} from "@/lib/dates";

const STATUS_OPTIONS = Object.entries(MEETING_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const TYPE_OPTIONS = Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const MINE_OPTIONS = [{ value: "true", label: MEETING_LABELS.mineMeetings }];

const ARCHIVE_OPTIONS = [
  { value: "false", label: MEETING_LABELS.activeOnly },
  { value: "true", label: MEETING_LABELS.archivedOnly },
];

const DATE_TABS: { key: MeetingDatePreset; label: string }[] = [
  { key: "all", label: MEETING_LABELS.dateAll },
  { key: "today", label: MEETING_LABELS.dateToday },
  { key: "week", label: MEETING_LABELS.dateWeek },
  { key: "month", label: MEETING_LABELS.dateMonth },
  { key: "year", label: MEETING_LABELS.dateYear },
];

function StatTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: typeof CalendarDays;
}) {
  return (
    <div
      className="brm-stat flex items-start justify-between gap-2"
      style={{ ["--stat-tone" as string]: tone }}
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

export default function MeetingsPage() {
  const router = useRouter();
  const { can: allowed } = usePermissions();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [mine, setMine] = useState("");
  const [archived, setArchived] = useState("");
  const [datePreset, setDatePreset] = useState<MeetingDatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useMeetings(filters);
  const canManage = allowed("meeting:manage");

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

  const clearDateFilters = () =>
    setFilters((prev) => {
      const { heldFrom, heldTo, ...rest } = prev;
      return { ...rest, page: "1" };
    });

  const applyDatePreset = (preset: MeetingDatePreset) => {
    setDatePreset(preset);
    setDateFrom("");
    setDateTo("");
    if (preset === "all") {
      clearDateFilters();
      return;
    }
    const range = meetingDateRange(preset);
    setFilters((prev) => ({ ...prev, ...range, page: "1" }));
  };

  const applyCustomDates = (from: string, to: string) => {
    setDatePreset("all");
    setDateFrom(from);
    setDateTo(to);
    if (!from && !to) {
      clearDateFilters();
      return;
    }
    const range = customMeetingDateRange(from, to);
    setFilters((prev) => {
      const next: Record<string, string> = { ...prev, page: "1" };
      delete next.heldFrom;
      delete next.heldTo;
      return { ...next, ...range };
    });
  };

  const rows: MeetingCardMeeting[] = data?.data ?? [];
  const held = rows.filter((m) => m.status === "HELD").length;
  const scheduled = rows.filter((m) => m.status === "SCHEDULED").length;
  const points = rows.reduce((sum, m) => sum + (m._count?.points ?? 0), 0);

  return (
    <AppShell>
      <PageHeader
        title={MEETING_LABELS.meetingsTitle}
        description={MEETING_LABELS.meetingsDescription}
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="ml-2 h-4 w-4" aria-hidden /> {MEETING_LABELS.newMeeting}
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
              icon={CalendarDays}
            />
            <StatTile
              label={MEETING_STATUS_LABELS.SCHEDULED}
              value={scheduled}
              tone="#0EA5E9"
              icon={CalendarDays}
            />
            <StatTile
              label={MEETING_STATUS_LABELS.HELD}
              value={held}
              tone="#10B981"
              icon={CalendarCheck}
            />
            <StatTile
              label={MEETING_LABELS.minutePoints}
              value={points}
              tone="#8B5CF6"
              icon={ListChecks}
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
          placeholder={MEETING_LABELS.searchMeetings}
          aria-label={MEETING_LABELS.searchMeetings}
          className="ps-9"
          value={search}
          onChange={onSearchChange}
        />
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="brm-seg overflow-x-auto" role="group" aria-label={MEETING_LABELS.filterDate}>
          {DATE_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              data-on={datePreset === key && !dateFrom && !dateTo}
              onClick={() => applyDatePreset(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <label
            htmlFor="meeting-date-from"
            className="shrink-0 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {MEETING_LABELS.dateFrom}
          </label>
          <Input
            id="meeting-date-from"
            type="date"
            value={dateFrom}
            className="h-9 min-w-0 flex-1"
            onChange={(e) => applyCustomDates(e.target.value, dateTo)}
          />
          <label
            htmlFor="meeting-date-to"
            className="shrink-0 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {MEETING_LABELS.dateTo}
          </label>
          <Input
            id="meeting-date-to"
            type="date"
            value={dateTo}
            className="h-9 min-w-0 flex-1"
            min={dateFrom || undefined}
            onChange={(e) => applyCustomDates(dateFrom, e.target.value)}
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
          onChange={(v) => {
            setStatus(v);
            setFilter("status", v);
          }}
          placeholder={MEETING_LABELS.filterStatus}
          aria-label={MEETING_LABELS.filterStatus}
          triggerClassName="h-9"
          items={STATUS_OPTIONS}
        />
        <ThemeSelect
          value={type}
          onChange={(v) => {
            setType(v);
            setFilter("type", v);
          }}
          placeholder={MEETING_LABELS.filterType}
          aria-label={MEETING_LABELS.filterType}
          triggerClassName="h-9"
          items={TYPE_OPTIONS}
        />
        <ThemeSelect
          value={mine}
          onChange={(v) => {
            setMine(v);
            setFilter("mine", v);
          }}
          placeholder={MEETING_LABELS.filterAll}
          aria-label={MEETING_LABELS.mineMeetings}
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
            {MEETING_LABELS.meetingCount}
          </span>
        </p>
      )}

      {isLoading ? (
        <SkeletonList count={5} />
      ) : !rows.length ? (
        <EmptyState
          title={MEETING_LABELS.noMeetings}
          command="list meetings --status held"
          description={MEETING_LABELS.noMeetingsHint}
          action={
            canManage
              ? { label: MEETING_LABELS.newMeeting, onClick: () => setCreating(true) }
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((meeting) => (
            <MeetingListCard
              key={meeting.id}
              meeting={meeting}
              onOpen={(id) => router.push(`/meetings/${id}`)}
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

      {creating && <MeetingEditorDialog onClose={() => setCreating(false)} />}
    </AppShell>
  );
}
