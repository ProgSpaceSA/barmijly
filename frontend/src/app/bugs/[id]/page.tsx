"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Paperclip,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BugStatusBadge, SeverityBadge, TestCodeBadge } from "@/components/testing/TestingBadges";
import { OrderedStepList } from "@/components/testing/OrderedStepList";
import { StepEditor } from "@/components/testing/StepEditor";
import { PromoteBugDialog } from "@/components/testing/PromoteBugDialog";
import { useBug, useBugActions } from "@/hooks/useBugs";
import { useBugSteps, useSuiteCases } from "@/hooks/useTestCases";
import { useTickets } from "@/hooks/useTickets";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  deleteAttachment,
  downloadAttachment,
  fetchAttachmentObjectUrl,
  uploadAttachment,
} from "@/lib/attachments";
import {
  BUG_SEVERITY_LABELS,
  BUG_STATUS_LABELS,
  PRIORITY_LABELS,
  SELECT_PLACEHOLDERS,
  TESTING_LABELS,
} from "@/lib/constants";
import { formatCaseCode, formatTicketCode } from "@/lib/utils";

const ACTION_BTN =
  "inline-flex h-9 min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold disabled:opacity-60";

const INDIGO_BTN = {
  background: "rgba(79,70,229,0.12)",
  color: "#818CF8",
  border: "1px solid rgba(79,70,229,0.35)",
} as const;

type CasePick = {
  id: string;
  title: string;
  caseNumber?: number | null;
  suiteTitle?: string;
};

export default function BugDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { can: allowed } = usePermissions();
  const { data: bug, isLoading } = useBug(id);
  const { data: steps } = useBugSteps(id);
  const actions = useBugActions(id, bug?.testCaseId ?? undefined);
  const canPromote = allowed("bug:promote");
  const canEdit = allowed("bug:create");
  const canAssign = allowed("bug:assign");

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    expectedBehavior: "",
    actualBehavior: "",
    environment: "",
    severity: "MAJOR",
    priority: "",
  });
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [unlinkTicket, setUnlinkTicket] = useState(false);
  const [unlinkCase, setUnlinkCase] = useState(false);
  const [linkCaseOpen, setLinkCaseOpen] = useState(false);
  const [linkTicketOpen, setLinkTicketOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [stepsSaving, setStepsSaving] = useState(false);
  const [bugUploadPercent, setBugUploadPercent] = useState<number | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  const suiteId = bug?.suiteId as string | undefined;
  const systemId = bug?.systemId as string | undefined;

  useEffect(() => {
    if (!bug) return;
    setForm({
      title: bug.title ?? "",
      description: bug.description ?? "",
      expectedBehavior: bug.expectedBehavior ?? "",
      actualBehavior: bug.actualBehavior ?? "",
      environment: bug.environment ?? "",
      severity: bug.severity ?? "MAJOR",
      priority: bug.priority ?? "",
    });
  }, [bug]);

  const pending =
    actions.update.isPending ||
    actions.promote.isPending ||
    actions.archive.isPending ||
    actions.unarchive.isPending ||
    actions.changeStatus.isPending ||
    stepsSaving;
  const ready = form.title.trim().length > 0 && form.description.trim().length > 0;

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openAttachment = (attachmentId: string) =>
    fetchAttachmentObjectUrl(attachmentId)
      .then(setLightboxUrl)
      .catch(() => {});

  const bugUploading = bugUploadPercent !== null;

  const uploadBugFiles = async (files: File[]) => {
    if (!files.length) return;
    setBugUploadPercent(0);
    try {
      for (const file of files) {
        await uploadAttachment(
          file,
          { bugId: id },
          { onUploadProgress: setBugUploadPercent },
        );
      }
      await qc.refetchQueries({ queryKey: qk.bugs.detail(id) });
      toast.success(TESTING_LABELS.saved);
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      toast.error(message || TESTING_LABELS.uploadFailed);
    } finally {
      setBugUploadPercent(null);
    }
  };

  const removeBugAttachment = async (attachmentId: string) => {
    setDeletingAttachmentId(attachmentId);
    const previous = qc.getQueryData(qk.bugs.detail(id));
    qc.setQueryData(
      qk.bugs.detail(id),
      (old: { attachments?: { id: string }[] } | undefined) => {
        if (!old?.attachments) return old;
        return {
          ...old,
          attachments: old.attachments.filter((a) => a.id !== attachmentId),
        };
      },
    );
    try {
      await deleteAttachment(attachmentId);
      toast.success(TESTING_LABELS.saved);
      await qc.refetchQueries({ queryKey: qk.bugs.detail(id) });
    } catch {
      qc.setQueryData(qk.bugs.detail(id), previous);
      toast.error(TESTING_LABELS.detachFailed);
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const startEdit = () => setEditing(true);
  const cancelEdit = () => {
    if (!bug) return;
    setForm({
      title: bug.title ?? "",
      description: bug.description ?? "",
      expectedBehavior: bug.expectedBehavior ?? "",
      actualBehavior: bug.actualBehavior ?? "",
      environment: bug.environment ?? "",
      severity: bug.severity ?? "MAJOR",
      priority: bug.priority ?? "",
    });
    setEditing(false);
  };

  const save = () => {
    if (!ready || !bug) return;
    void actions.update
      .mutateAsync({
        id: bug.id,
        title: form.title.trim(),
        description: form.description.trim(),
        severity: form.severity,
        ...(form.priority ? { priority: form.priority } : { priority: null }),
        expectedBehavior: form.expectedBehavior || null,
        actualBehavior: form.actualBehavior || null,
        environment: form.environment || null,
      })
      .then(() => {
        toast.success(TESTING_LABELS.saved);
        setEditing(false);
      });
  };

  const linkCase = (testCaseId: string) => {
    if (!bug || !testCaseId) return;
    void actions.update
      .mutateAsync({ id: bug.id, testCaseId })
      .then(() => {
        toast.success(TESTING_LABELS.caseLinkedToBug);
        setLinkCaseOpen(false);
      });
  };

  const linkTicket = (ticketId: string) => {
    if (!bug || !ticketId) return;
    void actions.update
      .mutateAsync({ id: bug.id, ticketId })
      .then(() => {
        toast.success(TESTING_LABELS.bugLinkedToast);
        setLinkTicketOpen(false);
      });
  };

  if (isLoading) {
    return (
      <AppShell>
        <SkeletonList count={5} />
      </AppShell>
    );
  }

  if (!bug) {
    return (
      <AppShell>
        <EmptyState title={TESTING_LABELS.noBugs} command={`open bug ${id}`} />
      </AppShell>
    );
  }

  const caseHref =
    bug.testCaseId && bug.suiteId
      ? `/test-suites/${bug.suiteId}?caseId=${bug.testCaseId}`
      : bug.testCaseId && bug.suite?.id
        ? `/test-suites/${bug.suite.id}?caseId=${bug.testCaseId}`
        : null;

  const stepList = steps ?? bug.steps ?? [];
  const suiteTitle = bug.suite?.title as string | undefined;
  const archived = Boolean(bug.isArchived);

  return (
    <AppShell>
      <Link
        href="/bugs"
        className="mb-4 inline-flex items-center gap-1 text-sm"
        style={{ color: "var(--muted-foreground)" }}
      >
        <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        {TESTING_LABELS.bugsTitle}
      </Link>

      <header className="mb-5 min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TestCodeBadge kind="bug" value={bug.bugNumber} />
          <SeverityBadge severity={bug.severity} />
          <BugStatusBadge status={bug.status} />
        </div>
        <h1 className="text-xl font-bold sm:text-2xl" style={{ color: "var(--foreground)" }}>
          {bug.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {bug.ticketId && (
            <span
              className="brm-chip inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              data-link="ticket"
              style={{ minHeight: 36 }}
            >
              <span className="opacity-80">{TESTING_LABELS.linkedTicketLabel}</span>
              <Link href={`/tickets/${bug.ticketId}`} className="inline-flex min-w-0 items-center gap-1.5">
                <span dir="ltr" className="ltr-isolate font-brm">
                  {formatTicketCode(bug.ticket?.ticketNumber) ?? TESTING_LABELS.hasTicket}
                </span>
                {bug.ticket?.title && <span className="truncate">{bug.ticket.title}</span>}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </Link>
              {canEdit && !archived && (
                <button
                  type="button"
                  onClick={() => setUnlinkTicket(true)}
                  aria-label={TESTING_LABELS.unlinkTicketFromBug}
                  className="shrink-0 rounded p-0.5"
                  style={{ color: "inherit", opacity: 0.7 }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </span>
          )}

          {bug.testCaseId && (
            <span
              className="brm-chip inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              data-link="case"
              style={{ minHeight: 36 }}
            >
              <span className="opacity-80">{TESTING_LABELS.linkedCaseLabel}</span>
              {caseHref ? (
                <Link href={caseHref} className="inline-flex min-w-0 items-center gap-1.5">
                  <span dir="ltr" className="ltr-isolate font-brm">
                    {formatCaseCode(bug.testCase?.caseNumber)}
                  </span>
                  <span className="truncate">
                    {bug.testCase?.title ?? TESTING_LABELS.fromCase}
                  </span>
                </Link>
              ) : (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span dir="ltr" className="ltr-isolate font-brm">
                    {formatCaseCode(bug.testCase?.caseNumber)}
                  </span>
                  <span className="truncate">
                    {bug.testCase?.title ?? TESTING_LABELS.fromCase}
                  </span>
                </span>
              )}
              {canEdit && !archived && (
                <button
                  type="button"
                  onClick={() => setUnlinkCase(true)}
                  aria-label={TESTING_LABELS.unlinkCaseFromBug}
                  className="shrink-0 rounded p-0.5"
                  style={{ color: "inherit", opacity: 0.7 }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </span>
          )}

          {suiteTitle && (
            <span
              className="brm-chip inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              data-link="suite"
              style={{ minHeight: 36 }}
            >
              <span className="opacity-80">{TESTING_LABELS.linkedSuiteLabel}</span>
              {bug.suiteId || bug.suite?.id ? (
                <Link href={`/test-suites/${bug.suiteId ?? bug.suite?.id}`} className="truncate">
                  {suiteTitle}
                </Link>
              ) : (
                <span className="truncate">{suiteTitle}</span>
              )}
            </span>
          )}
        </div>

        <div className="mt-3 flex w-full flex-wrap items-center justify-end gap-2">
          {canEdit && !editing && !archived && (
            <button type="button" onClick={startEdit} className={ACTION_BTN} style={INDIGO_BTN}>
              {TESTING_LABELS.edit}
            </button>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={save}
                disabled={!ready || pending}
                className={ACTION_BTN}
                style={INDIGO_BTN}
              >
                {actions.update.isPending ? TESTING_LABELS.saving : TESTING_LABELS.save}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className={ACTION_BTN}
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--muted-foreground)",
                  background: "var(--muted)",
                }}
              >
                {TESTING_LABELS.cancel}
              </button>
            </>
          )}

          {canPromote && !bug.ticketId && !archived && (
            <button
              type="button"
              onClick={() => setPromoteOpen(true)}
              disabled={pending}
              title={TESTING_LABELS.promoteHint}
              className={ACTION_BTN}
              style={{
                background: "rgba(239,68,68,0.10)",
                color: "#EF4444",
                border: "1px solid rgba(239,68,68,0.30)",
              }}
            >
              {TESTING_LABELS.promote}
            </button>
          )}

          {canEdit && !bug.ticketId && systemId && !archived && (
            <button
              type="button"
              onClick={() => setLinkTicketOpen(true)}
              disabled={pending}
              className={ACTION_BTN}
              style={{ background: "#4F46E5", color: "#fff" }}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {TESTING_LABELS.linkTicket}
            </button>
          )}

          {canEdit && !bug.testCaseId && !archived && (
            <button
              type="button"
              onClick={() => setLinkCaseOpen(true)}
              disabled={pending}
              className={ACTION_BTN}
              style={INDIGO_BTN}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {TESTING_LABELS.linkToCase}
            </button>
          )}

          {canAssign && !archived && (
            <div className="min-w-[9rem]">
              <ThemeSelect
                value={bug.status}
                onChange={(status) => {
                  if (!status || status === bug.status) return;
                  void actions.changeStatus
                    .mutateAsync({ id: bug.id, status })
                    .then(() => toast.success(TESTING_LABELS.saved));
                }}
                placeholder={TESTING_LABELS.status}
                aria-label={TESTING_LABELS.status}
                items={Object.entries(BUG_STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
                triggerClassName="h-9 min-h-9 py-0 text-xs"
              />
            </div>
          )}

          {canEdit && archived && (
            <button
              type="button"
              onClick={() => actions.unarchive.mutate(bug.id)}
              disabled={pending}
              className={ACTION_BTN}
              style={INDIGO_BTN}
            >
              {TESTING_LABELS.unarchiveBug}
            </button>
          )}

          {canEdit && !archived && (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              disabled={pending}
              className={ACTION_BTN}
              style={{
                border: "1px solid var(--border)",
                color: "var(--muted-foreground)",
                background: "var(--muted)",
              }}
            >
              {TESTING_LABELS.archiveBug}
            </button>
          )}
        </div>
      </header>

      <div
        className="space-y-4 rounded-2xl p-4 sm:p-5"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        {editing ? (
          <>
            <Field label={TESTING_LABELS.bugTitle}>
              <Input
                value={form.title}
                aria-label={TESTING_LABELS.bugTitle}
                onChange={(e) => set("title", e.target.value)}
                className="h-9 text-sm"
              />
            </Field>
            <Field label={TESTING_LABELS.bugDescription}>
              <Textarea
                value={form.description}
                aria-label={TESTING_LABELS.bugDescription}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                className="text-sm"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={TESTING_LABELS.severity}>
                <ThemeSelect
                  value={form.severity}
                  onChange={(v) => set("severity", v || "MAJOR")}
                  placeholder={TESTING_LABELS.severity}
                  items={Object.entries(BUG_SEVERITY_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </Field>
              <Field label={SELECT_PLACEHOLDERS.priority}>
                <ThemeSelect
                  value={form.priority}
                  onChange={(v) => set("priority", v)}
                  placeholder={SELECT_PLACEHOLDERS.priority}
                  items={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </Field>
            </div>
            <Field label={TESTING_LABELS.expectedBehavior}>
              <Textarea
                value={form.expectedBehavior}
                aria-label={TESTING_LABELS.expectedBehavior}
                onChange={(e) => set("expectedBehavior", e.target.value)}
                rows={2}
                className="text-sm"
              />
            </Field>
            <Field label={TESTING_LABELS.actualBehavior}>
              <Textarea
                value={form.actualBehavior}
                aria-label={TESTING_LABELS.actualBehavior}
                onChange={(e) => set("actualBehavior", e.target.value)}
                rows={2}
                className="text-sm"
              />
            </Field>
            <Field label={TESTING_LABELS.environment}>
              <Input
                value={form.environment}
                aria-label={TESTING_LABELS.environment}
                onChange={(e) => set("environment", e.target.value)}
                className="h-9 text-sm"
              />
            </Field>
            <StepEditor
              steps={stepList}
              owner={{ bugId: id }}
              label={TESTING_LABELS.reproSteps}
              onOpenImage={openAttachment}
              onSavingChange={setStepsSaving}
            />
          </>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0 space-y-5">
              <section
                className="rounded-xl p-4"
                style={{ background: "var(--muted)" }}
              >
                <p className="font-brm mb-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {TESTING_LABELS.bugDescription}
                </p>
                <Body text={bug.description} />
              </section>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <section
                  className="rounded-xl p-4"
                  style={{ background: "var(--muted)" }}
                >
                  <p className="font-brm mb-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {TESTING_LABELS.expectedBehavior}
                  </p>
                  <Body text={bug.expectedBehavior} />
                </section>
                <section
                  className="rounded-xl p-4"
                  style={{ background: "var(--muted)" }}
                >
                  <p className="font-brm mb-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {TESTING_LABELS.actualBehavior}
                  </p>
                  <Body text={bug.actualBehavior} />
                </section>
              </div>

              {bug.environment && (
                <Field label={TESTING_LABELS.environment}>
                  <Body text={bug.environment} />
                </Field>
              )}

              <section>
                <OrderedStepList
                  steps={stepList}
                  label={TESTING_LABELS.reproSteps}
                  readOnly
                  onOpenImage={openAttachment}
                />
              </section>

              <section className="min-w-0">
                <p className="font-brm mb-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {TESTING_LABELS.attachments}
                </p>
                {canEdit && !archived && (
                  <FileDropZone onFiles={uploadBugFiles} disabled={bugUploading}>
                    <button
                      type="button"
                      disabled={bugUploading}
                      className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm font-medium disabled:opacity-60"
                      style={{
                        borderColor: "var(--border)",
                        color: bugUploading ? "var(--muted-foreground)" : "#4F46E5",
                      }}
                    >
                      <Paperclip className="h-4 w-4" aria-hidden />
                      {bugUploading
                        ? TESTING_LABELS.uploadingPercent(bugUploadPercent ?? 0)
                        : TESTING_LABELS.attachments}
                    </button>
                  </FileDropZone>
                )}
                {!(bug.attachments?.length) ? (
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {TESTING_LABELS.noAttachments}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {(
                      bug.attachments as {
                        id: string;
                        fileName: string;
                        fileSize?: number;
                        mimeType?: string;
                        uploadedById?: string;
                      }[]
                    ).map((att) => {
                      const canDelete =
                        canEdit && !archived && att.uploadedById === user?.id;
                      const isImage = Boolean(att.mimeType?.startsWith("image/"));
                      return (
                        <li
                          key={att.id}
                          className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-2"
                          style={{ background: "var(--muted)" }}
                        >
                          <FileText
                            className="h-4 w-4 shrink-0"
                            style={{ color: "#4F46E5" }}
                            aria-hidden
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (isImage) openAttachment(att.id);
                              else void downloadAttachment(att.id, att.fileName);
                            }}
                            className="min-w-0 flex-1 truncate text-start text-sm font-medium"
                            style={{ color: "var(--foreground)" }}
                          >
                            {att.fileName}
                          </button>
                          <button
                            type="button"
                            onClick={() => void downloadAttachment(att.id, att.fileName)}
                            aria-label={TESTING_LABELS.downloadAttachment}
                            className="shrink-0 rounded p-1.5"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              disabled={deletingAttachmentId === att.id}
                              onClick={() => void removeBugAttachment(att.id)}
                              aria-label={TESTING_LABELS.delete}
                              className="shrink-0 rounded p-1.5 disabled:opacity-60"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <aside
              className="min-w-0 space-y-3 rounded-xl p-4 lg:sticky lg:top-4 lg:self-start"
              style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
            >
              <MetaRow label={TESTING_LABELS.status}>
                <BugStatusBadge status={bug.status} />
              </MetaRow>
              <MetaRow label={TESTING_LABELS.severity}>
                <SeverityBadge severity={bug.severity} />
              </MetaRow>
              <MetaRow label={SELECT_PLACEHOLDERS.priority}>
                <Body
                  text={
                    bug.priority
                      ? (PRIORITY_LABELS[bug.priority] ?? bug.priority)
                      : null
                  }
                />
              </MetaRow>
              <MetaRow label={TESTING_LABELS.assignee}>
                <Body
                  text={
                    [bug.assignedTo?.firstName, bug.assignedTo?.lastName]
                      .filter(Boolean)
                      .join(" ") || TESTING_LABELS.unassigned
                  }
                />
              </MetaRow>
              <MetaRow label={TESTING_LABELS.reportedBy}>
                <Body
                  text={
                    [bug.reportedBy?.firstName, bug.reportedBy?.lastName]
                      .filter(Boolean)
                      .join(" ") || null
                  }
                />
              </MetaRow>
              <MetaRow label={TESTING_LABELS.detectedAt}>
                {bug.createdAt ? (
                  <RelativeTime date={bug.createdAt} className="text-sm" />
                ) : (
                  <Body text={null} />
                )}
              </MetaRow>
              {bug.company?.name && (
                <MetaRow label={TESTING_LABELS.company}>
                  <Body text={bug.company.name} />
                </MetaRow>
              )}
              {bug.system?.name && (
                <MetaRow label={TESTING_LABELS.system}>
                  <Body text={bug.system.name} />
                </MetaRow>
              )}
            </aside>
          </div>
        )}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setLightboxUrl(null)}
          role="presentation"
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}

      {linkTicketOpen && systemId && (
        <LinkTicketPickerDialog
          systemId={systemId}
          companyId={bug.companyId as string | undefined}
          pending={actions.update.isPending}
          onClose={() => setLinkTicketOpen(false)}
          onPick={linkTicket}
        />
      )}

      {linkCaseOpen && (
        <LinkCasePickerDialog
          suiteId={suiteId}
          systemId={systemId}
          pending={actions.update.isPending}
          onClose={() => setLinkCaseOpen(false)}
          onPick={linkCase}
        />
      )}

      {promoteOpen && (
        <PromoteBugDialog
          bug={bug}
          pending={actions.promote.isPending}
          onClose={() => setPromoteOpen(false)}
          onConfirm={(title) => {
            void actions.promote
              .mutateAsync({ id: bug.id, title })
              .then((result: { ticket: { id: string } }) => {
                setPromoteOpen(false);
                router.push(`/tickets/${result.ticket.id}`);
              });
          }}
        />
      )}

      {confirmArchive && (
        <ConfirmDialog
          title={TESTING_LABELS.archiveTitle}
          message={TESTING_LABELS.archiveBugConfirm}
          actionLabel={TESTING_LABELS.archiveBug}
          pending={actions.archive.isPending}
          danger
          onClose={() => setConfirmArchive(false)}
          onConfirm={() =>
            actions.archive.mutate(bug.id, {
              onSuccess: () => {
                setConfirmArchive(false);
                toast.success(TESTING_LABELS.saved);
              },
            })
          }
        />
      )}

      {unlinkTicket && (
        <ConfirmDialog
          title={TESTING_LABELS.unlinkTicketFromBug}
          message={TESTING_LABELS.unlinkTicketFromBugConfirm}
          actionLabel={TESTING_LABELS.unlinkTicket}
          pending={actions.update.isPending}
          danger
          onClose={() => setUnlinkTicket(false)}
          onConfirm={() =>
            void actions.update
              .mutateAsync({ id: bug.id, ticketId: null })
              .then(() => {
                setUnlinkTicket(false);
                toast.success(TESTING_LABELS.saved);
              })
          }
        />
      )}

      {unlinkCase && (
        <ConfirmDialog
          title={TESTING_LABELS.unlinkCaseFromBug}
          message={TESTING_LABELS.unlinkCaseFromBugConfirm}
          actionLabel={TESTING_LABELS.unlinkCaseFromBug}
          pending={actions.update.isPending}
          danger
          onClose={() => setUnlinkCase(false)}
          onConfirm={() =>
            void actions.update
              .mutateAsync({ id: bug.id, testCaseId: null })
              .then(() => {
                setUnlinkCase(false);
                toast.success(TESTING_LABELS.saved);
              })
          }
        />
      )}
    </AppShell>
  );
}

function LinkCasePickerDialog({
  suiteId,
  systemId,
  pending,
  onClose,
  onPick,
}: {
  suiteId?: string;
  systemId?: string;
  pending?: boolean;
  onClose: () => void;
  onPick: (testCaseId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const needSuites = !suiteId && !!systemId;
  const { data: suiteCases, isLoading: loadingSuiteCases } = useSuiteCases(suiteId ?? "");
  const suiteFilters = useMemo((): Record<string, string> => (
    needSuites && systemId ? { systemId } : {}
  ), [needSuites, systemId]);
  const { data: suitesData, isLoading: loadingSuites } = useQuery({
    queryKey: qk.suites.list(suiteFilters),
    queryFn: () => api.get("/test-suites", { params: suiteFilters }).then((r) => r.data),
    enabled: needSuites,
  });

  const suites = useMemo(() => {
    if (!needSuites) return [] as { id: string; title: string }[];
    const list = (suitesData?.data ?? suitesData ?? []) as { id: string; title: string }[];
    return Array.isArray(list) ? list : [];
  }, [needSuites, suitesData]);

  const suiteCaseQueries = useQueries({
    queries: suites.map((suite) => ({
      queryKey: qk.cases.bySuite(suite.id),
      queryFn: () => api.get(`/test-suites/${suite.id}/cases`).then((r) => r.data),
      enabled: needSuites && !!suite.id,
    })),
  });

  const cases = useMemo((): CasePick[] => {
    if (suiteId) {
      const list = Array.isArray(suiteCases) ? suiteCases : (suiteCases?.data ?? []);
      return (list as { id: string; title: string; caseNumber?: number | null }[]).map((c) => ({
        id: c.id,
        title: c.title,
        caseNumber: c.caseNumber,
      }));
    }
    const flat: CasePick[] = [];
    suites.forEach((suite, i) => {
      const raw = suiteCaseQueries[i]?.data;
      const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
      for (const c of list as { id: string; title: string; caseNumber?: number | null }[]) {
        flat.push({
          id: c.id,
          title: c.title,
          caseNumber: c.caseNumber,
          suiteTitle: suite.title,
        });
      }
    });
    return flat;
  }, [suiteId, suiteCases, suites, suiteCaseQueries]);

  const q = search.trim().toLowerCase();
  const filtered = cases.filter((c) =>
    q
      ? c.title.toLowerCase().includes(q) ||
        String(c.caseNumber ?? "").includes(q) ||
        (c.suiteTitle ?? "").toLowerCase().includes(q)
      : true,
  );

  const isLoading =
    (suiteId && loadingSuiteCases) ||
    (needSuites && (loadingSuites || suiteCaseQueries.some((q) => q.isLoading)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TESTING_LABELS.linkToCase}
        className="brm-modal flex max-h-[85vh] w-full max-w-full flex-col overflow-hidden rounded-2xl sm:max-w-lg"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
            {TESTING_LABELS.linkToCase}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={TESTING_LABELS.close}
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="shrink-0 px-5 pt-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 start-3"
              style={{ color: "var(--muted-foreground)" }}
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={TESTING_LABELS.searchCases}
              aria-label={TESTING_LABELS.searchCases}
              className="h-10 ps-9 text-sm"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-5">
          {isLoading && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.loading}
            </p>
          )}
          {!isLoading && !filtered.length && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {suiteId || systemId ? TESTING_LABELS.noCases : TESTING_LABELS.linkCaseNeedsSuite}
            </p>
          )}
          {filtered.map((c) => {
            const label = `${formatCaseCode(c.caseNumber) ?? ""} ${c.title}`.trim();
            return (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => onPick(c.id)}
                className="brm-list-choice flex w-full min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2.5 text-start disabled:opacity-60"
                aria-label={label}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span dir="ltr" className="ltr-isolate shrink-0 font-brm text-xs">
                    {formatCaseCode(c.caseNumber)}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-xs font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    {c.title}
                  </span>
                </span>
                {c.suiteTitle && (
                  <span className="truncate text-[0.7rem]" style={{ color: "var(--muted-foreground)" }}>
                    {c.suiteTitle}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LinkTicketPickerDialog({
  systemId,
  companyId,
  pending,
  onClose,
  onPick,
}: {
  systemId: string;
  companyId?: string;
  pending?: boolean;
  onClose: () => void;
  onPick: (ticketId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filters: Record<string, string> = {
    systemId,
    limit: "50",
    ...(companyId ? { companyId } : {}),
  };
  const { data, isLoading } = useTickets(filters);
  const q = search.trim().toLowerCase();
  const rows: { id: string; title: string; ticketNumber?: number | null }[] = Array.isArray(
    data?.data,
  )
    ? data.data
    : Array.isArray(data)
      ? data
      : [];
  const tickets = rows.filter((t) =>
    q ? t.title.toLowerCase().includes(q) || String(t.ticketNumber ?? "").includes(q) : true,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TESTING_LABELS.linkTicket}
        className="brm-modal flex max-h-[85vh] w-full max-w-full flex-col overflow-hidden rounded-2xl sm:max-w-lg"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
            {TESTING_LABELS.linkTicket}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={TESTING_LABELS.close}
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="shrink-0 px-5 pt-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 start-3"
              style={{ color: "var(--muted-foreground)" }}
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={TESTING_LABELS.searchTickets}
              aria-label={TESTING_LABELS.searchTickets}
              className="h-10 ps-9 text-sm"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-5">
          {isLoading && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.loading}
            </p>
          )}
          {!isLoading && !tickets.length && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.noTicketsInSystem}
            </p>
          )}
          {tickets.map((ticket) => {
            const code = formatTicketCode(ticket.ticketNumber);
            const label = `${code ?? ""} ${ticket.title}`.trim();
            return (
              <button
                key={ticket.id}
                type="button"
                disabled={pending}
                onClick={() => onPick(ticket.id)}
                className="brm-list-choice flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-start disabled:opacity-60"
                aria-label={label}
              >
                {code && (
                  <span
                    dir="ltr"
                    className="brm-ticket-code ltr-isolate shrink-0 rounded-full px-2 py-0.5 font-brm text-[0.65rem] font-semibold"
                  >
                    {code}
                  </span>
                )}
                <span
                  className="min-w-0 flex-1 text-xs font-medium break-words"
                  style={{ color: "var(--foreground)" }}
                >
                  {ticket.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-brm mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
      <p className="font-brm mb-1 text-[0.65rem]" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function Body({ text }: { text?: string | null }) {
  return (
    <p
      className="text-sm leading-relaxed whitespace-pre-wrap"
      style={{ color: text?.trim() ? "var(--foreground)" : "var(--muted-foreground)" }}
    >
      {text?.trim() ? text : "—"}
    </p>
  );
}
