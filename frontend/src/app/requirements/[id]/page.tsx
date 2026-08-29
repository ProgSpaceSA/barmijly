"use client";
import { use, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarClock,
  ExternalLink,
  Ticket as TicketIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SkeletonTicketDetail } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { PriorityBadge } from "@/components/shared/StatusBadge";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { Input } from "@/components/ui/input";
import { CommentThread } from "@/components/tickets/CommentThread";
import {
  MeetingCodeBadge,
  RequirementSourceBadge,
  RequirementStatusBadge,
} from "@/components/meetings/MeetingBadges";
import { AttachmentsPanel } from "@/components/meetings/AttachmentsPanel";
import { PromoteRequirementDialog } from "@/components/meetings/PromoteRequirementDialog";
import {
  RequirementHistoryList,
} from "@/components/meetings/RequirementHistoryList";
import { useRequirement, useRequirementActions } from "@/hooks/useRequirements";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  MEETING_LABELS,
  PRIORITY_LABELS,
  REQUIREMENT_STATUS_LABELS,
  TRIAGE_REQUIREMENT_STATUSES,
} from "@/lib/constants";
import { formatAbsoluteTime } from "@/lib/dates";
import { formatMeetingCode, formatTicketCode } from "@/lib/utils";

const STATUS_OPTIONS = TRIAGE_REQUIREMENT_STATUSES.map((value) => ({
  value,
  label: REQUIREMENT_STATUS_LABELS[value] ?? value,
}));

const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function asList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="min-w-0 rounded-xl p-4 sm:p-5"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-brm mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

export default function RequirementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { can: allowed, user } = usePermissions();
  const { data: requirement, isLoading, isError } = useRequirement(id);
  const actions = useRequirementActions(id);

  const [statusDraft, setStatusDraft] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [confirm, setConfirm] = useState<
    { title: string; message: string; action: () => void } | null
  >(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionPending, setDescriptionPending] = useState(false);
  const descriptionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionDirtyRef = useRef(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const descriptionDraftRef = useRef("");
  const requirementRef = useRef(requirement);
  const commitDescriptionRef = useRef<(value: string) => void>(() => {});

  const companyId = requirement?.companyId ?? "";
  const systemId = requirement?.systemId ?? "";
  const developerScope =
    systemId && companyId ? { systemId, companyId } : undefined;

  const { data: systemsRaw } = useQuery({
    queryKey: qk.systems.byCompany(companyId),
    queryFn: () => api.get(`/systems?companyId=${companyId}`).then((r) => r.data),
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const systems = asList<{ id: string; name: string }>(systemsRaw);

  const { data: usersRaw } = useQuery({
    queryKey: qk.users.developers(developerScope),
    queryFn: () =>
      api
        .get("/users/developers", { params: developerScope ?? {} })
        .then((r) => r.data),
    enabled: allowed("requirement:triage"),
    staleTime: 60_000,
  });
  const owners = asList<{ id: string; firstName: string; lastName: string }>(usersRaw);

  const { data: mentionableRaw } = useQuery({
    queryKey: qk.users.mentionable({ requirementId: id }),
    queryFn: () =>
      api.get("/users/mentionable", { params: { requirementId: id } }).then((r) => r.data),
    enabled: !!id,
    staleTime: 60_000,
  });
  const mentionUsers = useMemo(
    () =>
      asList<{ id: string; firstName: string; lastName: string; email?: string; role?: string }>(
        mentionableRaw,
      ),
    [mentionableRaw],
  );

  useEffect(() => {
    descriptionDraftRef.current = descriptionDraft;
  });

  useEffect(() => {
    if (!requirement) return;
    requirementRef.current = requirement;
    if (actions.update.isPending) return;
    if (descriptionDirtyRef.current) {
      const serverText = requirement.description ?? "";
      if (descriptionDraftRef.current === serverText) descriptionDirtyRef.current = false;
      else return;
    }
    const serverText = requirement.description ?? "";
    if (descriptionDraftRef.current === serverText) return;
    descriptionDraftRef.current = serverText;
    setDescriptionDraft(serverText);
  }, [requirement, requirement?.description, actions.update.isPending]);

  const resizeDescription = () => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    resizeDescription();
  }, [descriptionDraft]);

  const commitDescription = (value: string) => {
    if (descriptionDebounceRef.current) {
      clearTimeout(descriptionDebounceRef.current);
      descriptionDebounceRef.current = null;
    }
    const serverText = requirementRef.current?.description ?? "";
    if (value === serverText) {
      if (descriptionDraftRef.current === serverText) descriptionDirtyRef.current = false;
      setDescriptionPending(false);
      return;
    }
    const payload = value.trim() || null;
    actions.update.mutate(
      { id, description: payload },
      {
        onSuccess: (row) => {
          requirementRef.current = row;
          const saved = row.description ?? "";
          if (descriptionDraftRef.current === saved) descriptionDirtyRef.current = false;
          setDescriptionPending(false);
        },
        onError: () => setDescriptionPending(false),
      },
    );
  };

  useEffect(() => {
    commitDescriptionRef.current = commitDescription;
  });

  useEffect(
    () => () => {
      if (descriptionDebounceRef.current) {
        clearTimeout(descriptionDebounceRef.current);
        descriptionDebounceRef.current = null;
      }
      commitDescriptionRef.current(descriptionDraftRef.current);
    },
    [],
  );

  if (isLoading) {
    return (
      <AppShell>
        <SkeletonTicketDetail />
      </AppShell>
    );
  }

  if (isError || !requirement) {
    return (
      <AppShell>
        <EmptyState
          title={MEETING_LABELS.notFound}
          command="open requirement"
          description={MEETING_LABELS.loadFailed}
          action={{ label: MEETING_LABELS.back, onClick: () => router.push("/requirements") }}
        />
      </AppShell>
    );
  }

  const canTriage = allowed("requirement:triage");
  const canPromote = allowed("requirement:promote");
  const converted = requirement.status === "CONVERTED";
  const editable = canTriage && !requirement.isArchived && !converted;
  const meeting = requirement.meetingPoint?.meeting;
  const asker =
    [requirement.requestedBy?.firstName, requirement.requestedBy?.lastName]
      .filter(Boolean)
      .join(" ") || requirement.requestedByName;

  const patch = (data: Record<string, unknown>) =>
    void actions.update.mutateAsync({ id, ...data });

  const scheduleDescriptionSave = (value: string) => {
    descriptionDirtyRef.current = true;
    descriptionDraftRef.current = value;
    setDescriptionPending(true);
    setDescriptionDraft(value);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    descriptionDebounceRef.current = setTimeout(() => commitDescription(value), 600);
  };

  const descriptionSaving =
    descriptionPending ||
    (actions.update.isPending &&
      actions.update.variables != null &&
      "description" in (actions.update.variables as object));

  return (
    <AppShell>
      <button
        type="button"
        onClick={() => router.push("/requirements")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm"
        style={{ color: "var(--muted-foreground)" }}
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        {MEETING_LABELS.back}
      </button>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MeetingCodeBadge kind="requirement" value={requirement.requirementNumber} />
        <RequirementStatusBadge status={requirement.status} />
        <RequirementSourceBadge source={requirement.source} />
        <PriorityBadge priority={requirement.priority} />
        {requirement.isArchived && (
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {MEETING_LABELS.archivedOnly}
          </span>
        )}
      </div>

      <h1
        className="mb-3 text-xl font-bold sm:text-2xl"
        style={{ color: "var(--foreground)" }}
      >
        {requirement.title}
      </h1>

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {requirement.company && (
          <span
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            <CompanyLogo company={requirement.company} size="xs" />
            {requirement.company.name}
          </span>
        )}
        <span
          className="text-sm"
          style={{ color: requirement.system ? "var(--muted-foreground)" : "#F59E0B" }}
        >
          {requirement.system?.name ?? MEETING_LABELS.unpinned}
        </span>
        {asker && (
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {MEETING_LABELS.requestedBy}: {asker}
          </span>
        )}
        {requirement.dueDate && (
          <span
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            <CalendarClock className="h-4 w-4" aria-hidden />
            <RelativeTime date={requirement.dueDate} label={MEETING_LABELS.dueDate} />
          </span>
        )}
      </div>

      {canTriage && (
        <div className="mb-5 flex flex-wrap gap-2">
          {canPromote && !converted && !requirement.isArchived && (
            <button
              type="button"
              onClick={() => setPromoting(true)}
              disabled={!requirement.systemId || actions.promote.isPending}
              title={
                requirement.systemId
                  ? MEETING_LABELS.promoteHint
                  : MEETING_LABELS.promoteNeedsSystem
              }
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{
                background: "rgba(79,70,229,0.12)",
                color: "#818CF8",
                border: "1px solid rgba(79,70,229,0.35)",
                minHeight: 36,
              }}
            >
              <TicketIcon className="h-3.5 w-3.5" aria-hidden />
              {actions.promote.isPending ? MEETING_LABELS.promoting : MEETING_LABELS.promote}
            </button>
          )}
          {requirement.isArchived ? (
            <button
              type="button"
              onClick={() => void actions.unarchive.mutateAsync(id)}
              disabled={actions.unarchive.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{
                background: "rgba(79,70,229,0.12)",
                color: "#818CF8",
                border: "1px solid rgba(79,70,229,0.35)",
                minHeight: 36,
              }}
            >
              <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
              {MEETING_LABELS.unarchiveRequirement}
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: MEETING_LABELS.archiveRequirement,
                  message: MEETING_LABELS.archiveRequirementConfirm,
                  action: () => void actions.archive.mutateAsync(id),
                })
              }
              disabled={actions.archive.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{
                background: "color-mix(in srgb, #94A3B8 12%, transparent)",
                color: "#94A3B8",
                border: "1px solid color-mix(in srgb, #94A3B8 35%, transparent)",
                minHeight: 36,
              }}
            >
              <Archive className="h-3.5 w-3.5" aria-hidden />
              {MEETING_LABELS.archiveRequirement}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Section title={MEETING_LABELS.origin}>
            {meeting ? (
              allowed("meeting:read") ? (
                <Link
                  href={`/meetings/${meeting.id}`}
                  className="brm-ticket-link inline-flex items-center gap-2 text-sm"
                >
                  <span dir="ltr" className="ltr-isolate font-brm">
                    {formatMeetingCode(meeting.meetingNumber)}
                  </span>
                  {meeting.title}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              ) : (
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <span dir="ltr" className="ltr-isolate font-brm">
                    {formatMeetingCode(meeting.meetingNumber)}
                  </span>{" "}
                  {meeting.title}
                </p>
              )
            ) : (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {requirement.sourceNote || MEETING_LABELS.source}
              </p>
            )}
            {requirement.meetingPoint?.body && (
              <p
                className="mt-2 whitespace-pre-wrap rounded-xl p-3 text-sm leading-relaxed"
                style={{ background: "var(--muted)", color: "var(--foreground)" }}
              >
                {requirement.meetingPoint.body}
              </p>
            )}
          </Section>

          {(editable || requirement.description) && (
            <Section
              title={MEETING_LABELS.requirementDescription}
              action={
                editable && descriptionSaving ? (
                  <span
                    className="text-xs font-medium"
                    style={{ color: "#818CF8" }}
                    role="status"
                  >
                    {MEETING_LABELS.saving}
                  </span>
                ) : null
              }
            >
              {editable ? (
                <textarea
                  ref={descriptionRef}
                  value={descriptionDraft}
                  rows={1}
                  aria-label={MEETING_LABELS.requirementDescription}
                  placeholder={MEETING_LABELS.requirementDescriptionHint}
                  disabled={false}
                  className="brm-step-textarea w-full min-w-0 rounded-xl border border-border bg-muted px-3 text-sm leading-relaxed text-foreground outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/30"
                  onChange={(e) => {
                    scheduleDescriptionSave(e.target.value);
                    requestAnimationFrame(resizeDescription);
                  }}
                />
              ) : (
                <p
                  className="whitespace-pre-wrap text-sm leading-relaxed"
                  style={{ color: "var(--foreground)" }}
                >
                  {requirement.description}
                </p>
              )}
            </Section>
          )}

          <Section title={MEETING_LABELS.comments}>
            <CommentThread
              parent={{ kind: "requirement", id }}
              comments={requirement.comments ?? []}
              users={mentionUsers}
              currentUserId={user?.id}
              currentUserName={[user?.firstName, user?.lastName].filter(Boolean).join(" ")}
              canPostInternal={allowed("comment:internal")}
              onOpenImage={setLightboxUrl}
            />
          </Section>

          <Section title={MEETING_LABELS.history}>
            <RequirementHistoryList
              statusRows={
                (requirement.statusHistory ?? []) as {
                  id: string;
                  toStatus: string;
                  note?: string | null;
                  createdAt: string;
                  changedBy?: { firstName?: string; lastName?: string } | null;
                }[]
              }
              descriptionRows={
                (requirement.descriptionHistory ?? []) as {
                  id: string;
                  toDescription?: string | null;
                  createdAt: string;
                  changedBy?: { firstName?: string; lastName?: string } | null;
                }[]
              }
              empty={MEETING_LABELS.historyEmpty}
              currentUserId={user?.id}
            />
          </Section>
        </div>

        <div className="min-w-0 space-y-4">
          {canTriage && (
            <Section title={MEETING_LABELS.changeStatus}>
              {converted ? (
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {REQUIREMENT_STATUS_LABELS.CONVERTED}
                </p>
              ) : (
                <div className="space-y-2">
                  <ThemeSelect
                    value={statusDraft || requirement.status}
                    onChange={setStatusDraft}
                    placeholder={MEETING_LABELS.status}
                    aria-label={MEETING_LABELS.status}
                    triggerClassName="h-9"
                    disabled={requirement.isArchived || actions.changeStatus.isPending}
                    items={STATUS_OPTIONS}
                  />
                  <Input
                    value={statusNote}
                    aria-label={MEETING_LABELS.statusNote}
                    placeholder={MEETING_LABELS.statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    className="h-9 text-sm"
                    disabled={requirement.isArchived || actions.changeStatus.isPending}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = statusDraft || requirement.status;
                      if (next === requirement.status) return;
                      void actions.changeStatus
                        .mutateAsync({
                          id,
                          status: next,
                          ...(statusNote.trim() ? { note: statusNote.trim() } : {}),
                        })
                        .then(() => {
                          setStatusDraft("");
                          setStatusNote("");
                        });
                    }}
                    disabled={
                      requirement.isArchived ||
                      actions.changeStatus.isPending ||
                      !statusDraft ||
                      statusDraft === requirement.status
                    }
                    className="w-full rounded-xl py-2 text-sm font-semibold disabled:opacity-60"
                    style={{
                      background: "rgba(79,70,229,0.12)",
                      color: "#818CF8",
                      border: "1px solid rgba(79,70,229,0.35)",
                    }}
                  >
                    {actions.changeStatus.isPending
                      ? MEETING_LABELS.saving
                      : MEETING_LABELS.changeStatus}
                  </button>
                </div>
              )}
            </Section>
          )}

          <Section title={MEETING_LABELS.filterOwner}>
            <div className="space-y-3">
              <Row label={MEETING_LABELS.system}>
                {editable ? (
                  <ThemeSelect
                    value={requirement.systemId ?? ""}
                    onChange={(value) => patch({ systemId: value || null })}
                    placeholder={MEETING_LABELS.unpinned}
                    aria-label={MEETING_LABELS.system}
                    triggerClassName="h-9"
                    disabled={actions.update.isPending}
                    items={systems.map((s) => ({ value: s.id, label: s.name }))}
                  />
                ) : (
                  <p className="text-sm" style={{ color: "var(--foreground)" }}>
                    {requirement.system?.name ?? MEETING_LABELS.unpinned}
                  </p>
                )}
              </Row>

              <Row label={MEETING_LABELS.owner}>
                {editable ? (
                  <ThemeSelect
                    value={requirement.ownerId ?? ""}
                    onChange={(value) => patch({ ownerId: value || null })}
                    placeholder={MEETING_LABELS.unassigned}
                    aria-label={MEETING_LABELS.owner}
                    triggerClassName="h-9"
                    disabled={actions.update.isPending}
                    items={owners.map((u) => ({
                      value: u.id,
                      label: `${u.firstName} ${u.lastName}`,
                    }))}
                  />
                ) : (
                  <p className="text-sm" style={{ color: "var(--foreground)" }}>
                    {[requirement.owner?.firstName, requirement.owner?.lastName]
                      .filter(Boolean)
                      .join(" ") || MEETING_LABELS.unassigned}
                  </p>
                )}
              </Row>

              <Row label={MEETING_LABELS.priority}>
                {editable ? (
                  <ThemeSelect
                    value={requirement.priority ?? ""}
                    onChange={(value) => patch({ priority: value || null })}
                    placeholder={MEETING_LABELS.optional}
                    aria-label={MEETING_LABELS.priority}
                    triggerClassName="h-9"
                    disabled={actions.update.isPending}
                    items={PRIORITY_OPTIONS}
                  />
                ) : (
                  <PriorityBadge priority={requirement.priority} />
                )}
              </Row>

              <Row label={MEETING_LABELS.dueDate}>
                {editable ? (
                  <Input
                    type="date"
                    value={requirement.dueDate ? String(requirement.dueDate).slice(0, 10) : ""}
                    aria-label={MEETING_LABELS.dueDate}
                    onChange={(e) =>
                      patch({
                        dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                    className="h-9 text-sm"
                    disabled={actions.update.isPending}
                  />
                ) : (
                  <p className="text-sm" style={{ color: "var(--foreground)" }}>
                    {requirement.dueDate
                      ? formatAbsoluteTime(requirement.dueDate)
                      : MEETING_LABELS.optional}
                  </p>
                )}
              </Row>
            </div>
          </Section>

          <Section title={MEETING_LABELS.linkedTickets}>
            {!(requirement.tickets ?? []).length ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {MEETING_LABELS.noLinkedTickets}
              </p>
            ) : (
              <ul className="space-y-2">
                {(
                  requirement.tickets as {
                    id: string;
                    title: string;
                    ticketNumber?: number | null;
                    status: string;
                  }[]
                ).map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm"
                      style={{ background: "var(--muted)", color: "var(--foreground)" }}
                    >
                      <span dir="ltr" className="ltr-isolate font-brm shrink-0 text-xs">
                        {formatTicketCode(ticket.ticketNumber)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={MEETING_LABELS.attachments}>
            <AttachmentsPanel
              attachments={requirement.attachments ?? []}
              owner={{ requirementId: id }}
              refreshKey={qk.requirements.detail(id)}
              canUpload={allowed("attachment:upload") && !requirement.isArchived}
              currentUserId={user?.id}
              uploadLabel={MEETING_LABELS.addRequirementFile}
              onOpenImage={setLightboxUrl}
            />
          </Section>
        </div>
      </div>

      {promoting && (
        <PromoteRequirementDialog
          requirement={requirement}
          pending={actions.promote.isPending}
          onClose={() => setPromoting(false)}
          onConfirm={(data) => {
            void actions.promote
              .mutateAsync({ id, ...data })
              .then((result: { ticket: { id: string } }) => {
                setPromoting(false);
                router.push(`/tickets/${result.ticket.id}`);
              });
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          actionLabel={MEETING_LABELS.confirm}
          onConfirm={() => {
            confirm.action();
            setConfirm(null);
          }}
          onClose={() => setConfirm(null)}
        />
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)" }}
          role="presentation"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </AppShell>
  );
}
