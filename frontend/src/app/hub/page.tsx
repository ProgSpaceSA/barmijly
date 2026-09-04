"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ChevronDown, CircleAlert, Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList, SkeletonStat } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { ToolCard } from "@/components/hub/ToolCard";
import { ToolSection } from "@/components/hub/ToolSection";
import { ToolEditorDialog } from "@/components/hub/ToolEditorDialog";
import { ToolDecisionDialog, type ToolDecision } from "@/components/hub/ToolDecisionDialog";
import { FeedbackCard } from "@/components/hub/FeedbackCard";
import { FeedbackEditorDialog } from "@/components/hub/FeedbackEditorDialog";
import { GuideEditorDialog } from "@/components/hub/GuideEditorDialog";
import { useToolActions, useTools, type Tool } from "@/hooks/useTools";
import { useFeedback, useFeedbackActions, useFeedbackInboxCount } from "@/hooks/useFeedback";
import { useGuideActions, useGuides, type HubGuide } from "@/hooks/useGuides";
import { useDebouncedSearch } from "@/hooks/useDebouncedValue";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  FEEDBACK_KIND_LABELS,
  FEEDBACK_STATUS_LABELS,
  HUB_LABELS,
  TOOL_CATEGORY_LABELS,
  TOOL_STATUS_LABELS,
  TOOL_TEAM_LABELS,
} from "@/lib/constants";

type TabKey = "tools" | "guides" | "feedback";

/** Ops roles only — feedback assignees are leadership, not every mentionable user. */
const FEEDBACK_ASSIGNEE_ROLES = new Set([
  "PROGRAMMING_HEAD",
  "PROJECT_MANAGER",
  "SENIOR_MANAGEMENT",
]);

const CATEGORY_ORDER = Object.keys(TOOL_CATEGORY_LABELS);

const CATEGORY_OPTIONS = Object.entries(TOOL_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const TEAM_OPTIONS = Object.entries(TOOL_TEAM_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const STATUS_OPTIONS = Object.entries(TOOL_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const KIND_OPTIONS = Object.entries(FEEDBACK_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const FEEDBACK_STATUS_OPTIONS = Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function parseTab(value: string | null): TabKey {
  if (value === "guides" || value === "feedback") return value;
  return "tools";
}

function personLabel(person: { firstName: string; lastName: string }) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

/**
 * Group catalogue rows: pending requests under «جديدة», then one section per
 * category (primary category = first in the tool's categories array).
 */
function groupTools(rows: Tool[]) {
  const newlyAdded: Tool[] = [];
  const byCategory = new Map<string, Tool[]>();

  for (const tool of rows) {
    if (tool.status === "REQUESTED") {
      newlyAdded.push(tool);
      continue;
    }
    const category = tool.categories[0] ?? "OTHER";
    const list = byCategory.get(category) ?? [];
    list.push(tool);
    byCategory.set(category, list);
  }

  const categories = CATEGORY_ORDER.filter((key) => (byCategory.get(key)?.length ?? 0) > 0).map(
    (key) => ({ key, tools: byCategory.get(key)! }),
  );

  return { newlyAdded, categories };
}

function StatTile({
  label,
  value,
  tone,
  icon: Icon,
  alert,
}: {
  label: string;
  value: number;
  tone: string;
  icon: typeof Wrench;
  alert?: boolean;
}) {
  return (
    <div
      className="brm-stat flex items-start justify-between gap-2"
      data-alert={alert ? "true" : undefined}
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

/** Compact lifecycle step — LTR English content; title+summary visible, steps expand. */
function GuideRow({
  guide,
  open,
  onToggle,
  canManage,
  onEdit,
  onDelete,
  deletePending,
}: {
  guide: HubGuide;
  open: boolean;
  onToggle: () => void;
  canManage: boolean;
  onEdit: (guide: HubGuide) => void;
  onDelete: (guide: HubGuide) => void;
  deletePending: boolean;
}) {
  return (
    <article style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? HUB_LABELS.collapseGuide : HUB_LABELS.expandGuide}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-2 px-1 py-2.5 text-start sm:px-2"
        >
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
            style={{ color: "var(--muted-foreground)" }}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold" style={{ color: "var(--foreground)" }}>
              {guide.title}
            </span>
            <span className="block text-xs leading-snug" style={{ color: "var(--muted-foreground)" }}>
              {guide.summary}
            </span>
          </span>
        </button>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-1 pe-2 pt-2">
            <button
              type="button"
              aria-label={HUB_LABELS.editGuide}
              onClick={() => onEdit(guide)}
              className="inline-flex rounded-lg p-1.5"
              style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={HUB_LABELS.deleteGuide}
              disabled={deletePending}
              onClick={() => onDelete(guide)}
              className="inline-flex rounded-lg p-1.5 disabled:opacity-60"
              style={{ border: "1px solid var(--border)", color: "#EF4444" }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
      {open ? (
        <ol className="flex flex-col gap-1.5 pb-3 ps-7 pe-2 sm:ps-8">
          {guide.steps.map((step, index) => (
            <li key={`${guide.id}-${index}`} className="flex gap-2 text-sm" style={{ color: "var(--foreground)" }}>
              <span
                className="font-brm mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[0.65rem] font-bold tabular-nums"
                style={{
                  background: "rgba(79,70,229,0.12)",
                  color: "#818CF8",
                  border: "1px solid rgba(79,70,229,0.25)",
                }}
                aria-hidden
              >
                {index + 1}
              </span>
              <span className="min-w-0 leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

export default function HubPage() {
  return (
    <Suspense fallback={<SkeletonList count={4} variant="people" />}>
      <HubPageInner />
    </Suspense>
  );
}

function HubPageInner() {
  const { can: allowed } = usePermissions();
  const canRequest = allowed("tool:request");
  const canManage = allowed("tool:manage");
  const canTriage = allowed("feedback:triage");
  const canFileFeedback = allowed("feedback:create");
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<TabKey>(() => parseTab(searchParams.get("tab")));
  const [category, setCategory] = useState("");
  const [team, setTeam] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState<Tool | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingFeedback, setCreatingFeedback] = useState(false);
  const [creatingGuide, setCreatingGuide] = useState(false);
  const [editingGuide, setEditingGuide] = useState<HubGuide | null>(null);
  const [deciding, setDeciding] = useState<{ tool: Tool; decision: ToolDecision } | null>(null);
  const [openGuideId, setOpenGuideId] = useState<string>("");

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [feedbackFilters, setFeedbackFilters] = useState<Record<string, string>>({});

  const { search, onSearchChange } = useDebouncedSearch((value) =>
    setFilters((prev) => {
      if (!value) {
        const { search: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, search: value };
    }),
  );

  const { search: feedbackSearch, onSearchChange: onFeedbackSearchChange } = useDebouncedSearch(
    (value) =>
      setFeedbackFilters((prev) => {
        if (!value) {
          const { search: _drop, ...rest } = prev;
          return rest;
        }
        return { ...prev, search: value };
      }),
  );

  const catalogue = useTools(filters);
  const feedbackList = useFeedback(feedbackFilters, tab === "feedback");
  const guidesQuery = useGuides(tab === "guides");
  const { data: inboxCount } = useFeedbackInboxCount();
  const actions = useToolActions();
  const feedbackActions = useFeedbackActions();
  const guideActions = useGuideActions();

  const guideRows = guidesQuery.data ?? [];

  const { data: peopleRaw = [] } = useQuery<
    { id: string; firstName: string; lastName: string; role: string }[]
  >({
    queryKey: qk.users.mentionable(),
    queryFn: () => api.get("/users/mentionable").then((r) => r.data),
    enabled: tab === "feedback",
  });

  const people = useMemo(
    () =>
      peopleRaw
        .filter((person) => FEEDBACK_ASSIGNEE_ROLES.has(person.role))
        .map((person) => ({ value: person.id, label: personLabel(person) })),
    [peopleRaw],
  );

  const decidePending =
    actions.approve.isPending || actions.decline.isPending || actions.retire.isPending;

  const setFilter = (key: string, value: string) =>
    setFilters((prev) =>
      value
        ? { ...prev, [key]: value }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)),
    );

  const setFeedbackFilter = (key: string, value: string) =>
    setFeedbackFilters((prev) =>
      value
        ? { ...prev, [key]: value }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)),
    );

  const rows = catalogue.data?.data ?? [];
  const pendingCount = catalogue.data?.pendingCount ?? 0;
  const feedbackRows = feedbackList.data?.data ?? [];
  const toolGroups = useMemo(() => groupTools(rows), [rows]);

  const renderToolCard = (tool: Tool) => (
    <ToolCard
      key={tool.id}
      tool={tool}
      canManage={canManage}
      pending={decidePending}
      onEdit={canManage ? setEditing : undefined}
      onApprove={(row) => void actions.approve.mutateAsync(row.id)}
      onDecline={(row) => setDeciding({ tool: row, decision: "decline" })}
      onRetire={(row) => setDeciding({ tool: row, decision: "retire" })}
    />
  );

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "tools", label: HUB_LABELS.tabTools, badge: canManage ? pendingCount : undefined },
    { key: "guides", label: HUB_LABELS.tabGuides },
    {
      key: "feedback",
      label: HUB_LABELS.tabFeedback,
      badge: inboxCount,
    },
  ];

  const headerAction =
    tab === "tools" && canRequest ? (
      <Button onClick={() => setCreating(true)}>
        <Plus className="ml-2 h-4 w-4" aria-hidden /> {HUB_LABELS.newTool}
      </Button>
    ) : tab === "feedback" && canFileFeedback ? (
      <Button onClick={() => setCreatingFeedback(true)}>
        <Plus className="ml-2 h-4 w-4" aria-hidden /> {HUB_LABELS.newFeedback}
      </Button>
    ) : undefined;

  const confirmDecision = async (note: string) => {
    if (!deciding) return;
    const { tool, decision } = deciding;
    if (decision === "decline") await actions.decline.mutateAsync({ id: tool.id, note });
    else await actions.retire.mutateAsync({ id: tool.id, note });
    setDeciding(null);
  };

  return (
    <AppShell>
      <PageHeader
        title={HUB_LABELS.hubTitle}
        description={HUB_LABELS.hubDescription}
        action={headerAction}
      />

      <div
        className="mb-5 flex gap-1 overflow-x-auto"
        role="tablist"
        aria-label={HUB_LABELS.hubTitle}
      >
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={item.label}
              onClick={() => setTab(item.key)}
              className="shrink-0 px-3 py-2.5 text-sm font-semibold"
              style={{
                color: active ? "var(--foreground)" : "var(--muted-foreground)",
                borderBottom: `2px solid ${active ? "#818CF8" : "var(--border)"}`,
              }}
            >
              {item.label}
              {item.badge ? (
                <span
                  className="ms-1.5 inline-flex items-center rounded-md px-1.5 text-[0.65rem] font-bold tabular-nums"
                  style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}
                  aria-hidden
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "tools" && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
            {catalogue.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonStat key={i} />)
            ) : (
              <>
                <StatTile
                  label={HUB_LABELS.total}
                  value={catalogue.data?.total ?? 0}
                  tone="#4F46E5"
                  icon={Wrench}
                />
                <StatTile
                  label={HUB_LABELS.approved}
                  value={catalogue.data?.approvedCount ?? 0}
                  tone="#10B981"
                  icon={CheckCircle2}
                />
                <StatTile
                  label={HUB_LABELS.awaitingDecision}
                  value={pendingCount}
                  tone="#F59E0B"
                  icon={CircleAlert}
                  alert={pendingCount > 0}
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
              placeholder={HUB_LABELS.searchTools}
              aria-label={HUB_LABELS.searchTools}
              className="ps-9"
              value={search}
              onChange={onSearchChange}
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ThemeSelect
              value={category}
              onChange={(v) => {
                setCategory(v);
                setFilter("category", v);
              }}
              placeholder={HUB_LABELS.filterCategory}
              aria-label={HUB_LABELS.filterCategory}
              triggerClassName="h-9"
              items={CATEGORY_OPTIONS}
            />
            <ThemeSelect
              value={team}
              onChange={(v) => {
                setTeam(v);
                setFilter("team", v);
              }}
              placeholder={HUB_LABELS.filterTeam}
              aria-label={HUB_LABELS.filterTeam}
              triggerClassName="h-9"
              items={TEAM_OPTIONS}
            />
            {canManage && (
              <ThemeSelect
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setFilter("status", v);
                }}
                placeholder={HUB_LABELS.filterStatus}
                aria-label={HUB_LABELS.filterStatus}
                triggerClassName="h-9"
                items={STATUS_OPTIONS}
              />
            )}
          </div>

          {catalogue.isLoading ? (
            <SkeletonList count={4} variant="people" />
          ) : !rows.length ? (
            <EmptyState
              title={HUB_LABELS.noTools}
              command="list tools --approved"
              description={HUB_LABELS.noToolsHint}
              action={
                canRequest
                  ? { label: HUB_LABELS.newTool, onClick: () => setCreating(true) }
                  : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {toolGroups.newlyAdded.length > 0 ? (
                <ToolSection
                  title={HUB_LABELS.sectionNewlyAdded}
                  hint={HUB_LABELS.sectionNewlyAddedHint}
                  count={toolGroups.newlyAdded.length}
                  defaultOpen
                >
                  {toolGroups.newlyAdded.map(renderToolCard)}
                </ToolSection>
              ) : null}
              {toolGroups.categories.map(({ key, tools }) => (
                <ToolSection
                  key={key}
                  title={TOOL_CATEGORY_LABELS[key] ?? key}
                  count={tools.length}
                  defaultOpen
                >
                  {tools.map(renderToolCard)}
                </ToolSection>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "guides" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              className="flex min-w-0 items-center gap-2 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
              {HUB_LABELS.guidesIntro}
            </p>
            {canManage && guideRows.length > 0 ? (
              <Button type="button" onClick={() => setCreatingGuide(true)} className="shrink-0">
                <Plus className="ml-2 h-4 w-4" aria-hidden /> {HUB_LABELS.newGuide}
              </Button>
            ) : null}
          </div>
          {guidesQuery.isLoading ? (
            <SkeletonList count={4} variant="people" />
          ) : !guideRows.length ? (
            <EmptyState
              title={HUB_LABELS.noGuides}
              command="list guides"
              action={
                canManage
                  ? { label: HUB_LABELS.newGuide, onClick: () => setCreatingGuide(true) }
                  : undefined
              }
            />
          ) : (
            <div
              className="overflow-hidden rounded-xl"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {guideRows.map((guide) => (
                <GuideRow
                  key={guide.id}
                  guide={guide}
                  open={openGuideId === guide.id}
                  onToggle={() =>
                    setOpenGuideId((prev) => (prev === guide.id ? "" : guide.id))
                  }
                  canManage={canManage}
                  onEdit={setEditingGuide}
                  onDelete={(row) => {
                    if (window.confirm(HUB_LABELS.deleteGuideConfirm)) {
                      void guideActions.remove.mutateAsync(row.id);
                    }
                  }}
                  deletePending={guideActions.remove.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "feedback" && (
        <>
          <div className="relative mb-3">
            <Search
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ insetInlineStart: 12, color: "var(--muted-foreground)" }}
              aria-hidden
            />
            <Input
              placeholder={HUB_LABELS.searchFeedback}
              aria-label={HUB_LABELS.searchFeedback}
              className="ps-9"
              value={feedbackSearch}
              onChange={onFeedbackSearchChange}
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ThemeSelect
              value={kind}
              onChange={(v) => {
                setKind(v);
                setFeedbackFilter("kind", v);
              }}
              placeholder={HUB_LABELS.filterKind}
              aria-label={HUB_LABELS.filterKind}
              triggerClassName="h-9"
              items={KIND_OPTIONS}
            />
            <ThemeSelect
              value={feedbackStatus}
              onChange={(v) => {
                setFeedbackStatus(v);
                setFeedbackFilter("status", v);
              }}
              placeholder={HUB_LABELS.filterStatus}
              aria-label={HUB_LABELS.filterStatus}
              triggerClassName="h-9"
              items={FEEDBACK_STATUS_OPTIONS}
            />
            <ThemeSelect
              value={assignee}
              onChange={(v) => {
                setAssignee(v);
                setMine(false);
                setFeedbackFilters((prev) => {
                  const next = { ...prev };
                  delete next.mine;
                  delete next.unassigned;
                  delete next.assigneeId;
                  if (v === "__general__") next.unassigned = "true";
                  else if (v) next.assigneeId = v;
                  return next;
                });
              }}
              placeholder={HUB_LABELS.filterAssignee}
              aria-label={HUB_LABELS.filterAssignee}
              triggerClassName="h-9"
              items={[{ value: "__general__", label: HUB_LABELS.unassigned }, ...people]}
            />
            <button
              type="button"
              aria-pressed={mine}
              onClick={() => {
                const next = !mine;
                setMine(next);
                setAssignee("");
                setFeedbackFilters((prev) => {
                  const copy = { ...prev };
                  delete copy.assigneeId;
                  delete copy.unassigned;
                  if (next) copy.mine = "true";
                  else delete copy.mine;
                  return copy;
                });
              }}
              className="h-9 rounded-lg px-3 text-sm font-semibold"
              style={{
                background: mine ? "rgba(79,70,229,0.12)" : "transparent",
                color: mine ? "#818CF8" : "var(--muted-foreground)",
                border: `1px solid ${mine ? "rgba(79,70,229,0.35)" : "var(--border)"}`,
              }}
            >
              {HUB_LABELS.filterMine}
            </button>
          </div>

          {feedbackList.isLoading ? (
            <SkeletonList count={4} variant="people" />
          ) : feedbackList.isError ? (
            <EmptyState title={HUB_LABELS.loadFailed} command="list feedback" />
          ) : !feedbackRows.length ? (
            <EmptyState
              title={HUB_LABELS.noFeedback}
              command="list feedback"
              description={HUB_LABELS.noFeedbackHint}
              action={
                canFileFeedback
                  ? { label: HUB_LABELS.newFeedback, onClick: () => setCreatingFeedback(true) }
                  : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {feedbackRows.map((row) => (
                <FeedbackCard
                  key={row.id}
                  row={row}
                  people={people}
                  canTriage={canTriage}
                  pending={feedbackActions.update.isPending}
                  onUpdate={(id, data) => void feedbackActions.update.mutateAsync({ id, ...data })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {creating && <ToolEditorDialog onClose={() => setCreating(false)} />}
      {creatingFeedback && <FeedbackEditorDialog onClose={() => setCreatingFeedback(false)} />}
      {creatingGuide && <GuideEditorDialog onClose={() => setCreatingGuide(false)} />}
      {editingGuide && (
        <GuideEditorDialog guide={editingGuide} onClose={() => setEditingGuide(null)} />
      )}
      {editing && <ToolEditorDialog tool={editing} onClose={() => setEditing(null)} />}
      {deciding && (
        <ToolDecisionDialog
          tool={deciding.tool}
          decision={deciding.decision}
          pending={decidePending}
          onConfirm={(note) => void confirmDecision(note)}
          onClose={() => setDeciding(null)}
        />
      )}
    </AppShell>
  );
}
