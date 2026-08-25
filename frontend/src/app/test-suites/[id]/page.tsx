"use client";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, FileText, FlaskConical, Link2, Paperclip, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { TestCasePanel } from "@/components/testing/TestCasePanel";
import { TestCaseDetail } from "@/components/testing/TestCaseDetail";
import { PassRateBar } from "@/components/testing/PassRateBar";
import { TestCodeBadge, TestStateBadge } from "@/components/testing/TestingBadges";
import { LinkTicketToSuiteDialog } from "@/components/testing/LinkTicketToSuiteDialog";
import { useTestSuite, useSuiteActions } from "@/hooks/useTestSuites";
import { useCaseActions, useTestCase } from "@/hooks/useTestCases";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import {
  deleteAttachment,
  downloadAttachment,
  fetchAttachmentObjectUrl,
  uploadAttachment,
} from "@/lib/attachments";
import { TESTING_LABELS } from "@/lib/constants";
import { formatBytes, formatTicketCode } from "@/lib/utils";

/**
 * The suite workspace: nav rail → case panel → detail pane, right to left.
 *
 * On a phone the case panel *is* the screen and picking a case opens the detail
 * full-width with a back chevron — a 340px column and a detail pane side by side
 * at 360px would leave neither usable.
 *
 * `?caseId=` deep-links into a case (ticket testing section, bug chips, etc.).
 */
function SuiteWorkspaceContent({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const { user } = useAuthStore();
  const { can: allowed } = usePermissions();
  const qc = useQueryClient();
  const { data: suite, isLoading } = useTestSuite(id);
  const suiteActions = useSuiteActions(id);
  const caseActions = useCaseActions(id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [linkTicketsOpen, setLinkTicketsOpen] = useState(false);
  const [unlinkTicketId, setUnlinkTicketId] = useState<string | null>(null);
  const [suiteUploadPercent, setSuiteUploadPercent] = useState<number | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(true);

  const cases = suite?.cases ?? [];
  const suiteAttachments: {
    id: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    uploadedById?: string;
  }[] = suite?.attachments ?? [];
  const canAuthor = allowed("test:author");
  const canExecute = allowed("test:execute");
  const suiteUploading = suiteUploadPercent !== null;
  const ticketLinks: {
    ticketId: string;
    ticket: { id: string; title: string; ticketNumber?: number | null };
  }[] = suite?.ticketLinks ?? [];
  const suiteTickets = ticketLinks.map((link) => ({
    id: link.ticket.id,
    title: link.ticket.title,
    ticketNumber: link.ticket.ticketNumber,
  }));

  const selectCase = useCallback(
    (caseId: string | null) => {
      setSelectedId(caseId);
      const path = caseId ? `/test-suites/${id}?caseId=${caseId}` : `/test-suites/${id}`;
      router.replace(path, { scroll: false });
    },
    [id, router],
  );

  // Honour `?caseId=` when it matches; otherwise desktop opens the first case.
  useEffect(() => {
    if (!cases.length) return;
    if (caseIdParam && cases.some((c: { id: string }) => c.id === caseIdParam)) {
      setSelectedId(caseIdParam);
      return;
    }
    if (!caseIdParam && window.innerWidth >= 1024) {
      selectCase(cases[0].id);
    }
  }, [cases, caseIdParam, selectCase]);

  const { data: selectedCase } = useTestCase(selectedId ?? "");

  const openAttachment = (attachmentId: string) =>
    fetchAttachmentObjectUrl(attachmentId)
      .then(setLightboxUrl)
      .catch(() => {});

  const uploadSuiteFiles = async (files: File[]) => {
    if (!files.length) return;
    setSuiteUploadPercent(0);
    try {
      for (const file of files) {
        await uploadAttachment(
          file,
          { suiteId: id },
          { onUploadProgress: setSuiteUploadPercent },
        );
      }
      await qc.refetchQueries({ queryKey: qk.suites.detail(id) });
      toast.success(TESTING_LABELS.saved);
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || TESTING_LABELS.uploadFailed);
    } finally {
      setSuiteUploadPercent(null);
    }
  };

  const removeSuiteAttachment = async (attachmentId: string) => {
    setDeletingAttachmentId(attachmentId);
    const previous = qc.getQueryData(qk.suites.detail(id));
    qc.setQueryData(
      qk.suites.detail(id),
      (
        old:
          | {
              attachments?: { id: string }[];
            }
          | undefined,
      ) => {
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
      await qc.refetchQueries({ queryKey: qk.suites.detail(id) });
    } catch {
      qc.setQueryData(qk.suites.detail(id), previous);
      toast.error(TESTING_LABELS.detachFailed);
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const addCase = () =>
    caseActions.create.mutate(
      { title: TESTING_LABELS.newCase, expectedResult: "" },
      { onSuccess: (created: { id: string }) => selectCase(created.id) },
    );

  if (isLoading) {
    return (
      <AppShell>
        <SkeletonList count={5} />
      </AppShell>
    );
  }

  if (!suite) {
    return (
      <AppShell>
        <EmptyState title={TESTING_LABELS.noCases} command={`open suite ${id}`} />
      </AppShell>
    );
  }

  const detailOpen = Boolean(selectedId);

  return (
    <AppShell>
      <Link
        href="/test-suites"
        className="mb-4 inline-flex items-center gap-1 text-sm"
        style={{ color: "var(--muted-foreground)" }}
      >
        <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        {TESTING_LABELS.suitesTitle}
      </Link>

      <header className="mb-5 min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TestCodeBadge kind="suite" value={suite.suiteNumber} />
          <TestStateBadge state={suite.state} />
          {suite.company && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              <CompanyLogo company={suite.company} size="xs" />
              {suite.company.name}
            </span>
          )}
          {suite.system?.name && (
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {suite.system.name}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold sm:text-2xl" style={{ color: "var(--foreground)" }}>
              {suite.title}
            </h1>
            {suite.description && (
              <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                {suite.description}
              </p>
            )}
          </div>
          {canAuthor && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {suite.state === "DRAFT" && (
                <button
                  type="button"
                  disabled={suiteActions.publish.isPending}
                  onClick={() => suiteActions.publish.mutate(id)}
                  className="inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  style={{
                    minHeight: 36,
                    background: "rgba(79,70,229,0.12)",
                    color: "#818CF8",
                    border: "1px solid rgba(79,70,229,0.35)",
                  }}
                >
                  {TESTING_LABELS.publishSuite}
                </button>
              )}
              <button
                type="button"
                onClick={() => setLinkTicketsOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                style={{
                  minHeight: 36,
                  background: "rgba(79,70,229,0.08)",
                  color: "#4F46E5",
                  border: "1px solid rgba(79,70,229,0.25)",
                }}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                {TESTING_LABELS.linkTicket}
              </button>
              {suite.state === "ARCHIVED" ? (
                <button
                  type="button"
                  disabled={suiteActions.unarchive.isPending}
                  onClick={() => suiteActions.unarchive.mutate(id)}
                  className="inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  style={{
                    minHeight: 36,
                    background: "rgba(79,70,229,0.12)",
                    color: "#818CF8",
                    border: "1px solid rgba(79,70,229,0.35)",
                  }}
                >
                  {TESTING_LABELS.unarchiveSuite}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmArchive(true)}
                  className="inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-xs font-semibold"
                  style={{
                    minHeight: 36,
                    border: "1px solid var(--border)",
                    color: "var(--muted-foreground)",
                    background: "var(--muted)",
                  }}
                >
                  {TESTING_LABELS.archiveSuite}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-3">
          <PassRateBar rollup={suite.rollup} state={suite.state} className="w-full" />
        </div>

        {(!!ticketLinks.length || canAuthor) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.linkedTickets}
            </span>
            {ticketLinks.map((link) => (
              <span
                key={link.ticketId}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
                style={{ background: "var(--muted)", color: "var(--foreground)", minHeight: 32 }}
              >
                <Link
                  href={`/tickets/${link.ticket.id}`}
                  className="inline-flex min-w-0 items-center gap-1.5"
                >
                  <span dir="ltr" className="ltr-isolate font-brm">
                    {formatTicketCode(link.ticket.ticketNumber)}
                  </span>
                  <span className="truncate">{link.ticket.title}</span>
                </Link>
                {canAuthor && (
                  <button
                    type="button"
                    onClick={() => setUnlinkTicketId(link.ticketId)}
                    aria-label={TESTING_LABELS.unlinkTicket}
                    className="shrink-0 rounded p-0.5"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </header>

      <section className="mb-6 min-w-0">
        <button
          type="button"
          onClick={() => setAttachmentsOpen((wasOpen) => !wasOpen)}
          aria-expanded={attachmentsOpen}
          aria-label={
            attachmentsOpen
              ? TESTING_LABELS.collapseSuiteAttachments
              : TESTING_LABELS.expandSuiteAttachments
          }
          className="mb-2 flex w-full items-center gap-1.5 py-1 text-start"
        >
          {attachmentsOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            {TESTING_LABELS.suiteAttachments}
          </span>
          <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
            {suiteAttachments.length}
          </span>
        </button>
        {attachmentsOpen && (
          <div>
            {canAuthor && (
              <FileDropZone onFiles={uploadSuiteFiles} disabled={suiteUploading}>
                <button
                  type="button"
                  disabled={suiteUploading}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-sm font-medium disabled:opacity-60"
                  style={{
                    borderColor: "var(--border)",
                    color: suiteUploading ? "var(--muted-foreground)" : "#4F46E5",
                  }}
                >
                  <Paperclip className="h-4 w-4" aria-hidden />
                  {suiteUploading
                    ? TESTING_LABELS.uploadingPercent(suiteUploadPercent ?? 0)
                    : TESTING_LABELS.attachments}
                </button>
              </FileDropZone>
            )}
            {!suiteAttachments.length ? (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {TESTING_LABELS.attachments}
              </p>
            ) : (
              <ul className="space-y-2">
                {suiteAttachments.map((att) => {
                  const canDelete = canAuthor && att.uploadedById === user?.id;
                  const isImage = Boolean(att.mimeType?.startsWith("image/"));
                  return (
                    <li
                      key={att.id}
                      className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-2"
                      style={{ background: "var(--muted)" }}
                    >
                      <FileText className="h-4 w-4 shrink-0" style={{ color: "#4F46E5" }} aria-hidden />
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
                      {typeof att.fileSize === "number" && (
                        <span
                          className="font-brm shrink-0 text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {formatBytes(att.fileSize)}
                        </span>
                      )}
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
                          onClick={() => void removeSuiteAttachment(att.id)}
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
          </div>
        )}
      </section>

      {/*
        Case rail is first track = inline-start = right in RTL.
        Sticky + viewport height for the expected rail, with a negative
        margin-bottom so that height does NOT inflate the grid row (which was
        the empty scroll band under short details / closed bug forms).
      */}
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <aside
          className={
            detailOpen
              ? "hidden lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col lg:overflow-hidden lg:[margin-bottom:calc(6rem-100vh)]"
              : "lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col lg:overflow-hidden lg:[margin-bottom:calc(6rem-100vh)]"
          }
        >
          <TestCasePanel
            cases={cases}
            selectedId={selectedId}
            currentUserId={user?.id}
            canAuthor={canAuthor}
            onSelect={selectCase}
            onAddCase={addCase}
          />
        </aside>

        <div className={detailOpen ? "block min-w-0" : "hidden min-w-0 lg:block"}>
          {selectedCase ? (
            <>
              <button
                type="button"
                onClick={() => selectCase(null)}
                className="mb-3 inline-flex items-center gap-1 text-sm lg:hidden"
                style={{ color: "var(--muted-foreground)", minHeight: 44 }}
              >
                <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                {TESTING_LABELS.cases}
              </button>
              <TestCaseDetail
                testCase={selectedCase}
                bugs={selectedCase.bugs ?? []}
                suiteTickets={suiteTickets}
                systemId={suite.systemId ?? selectedCase.suite?.systemId}
                canAuthor={canAuthor}
                canExecute={canExecute}
                onOpenImage={openAttachment}
                onDeleted={() => selectCase(null)}
              />
            </>
          ) : (
            <div
              className="hidden flex-col items-center justify-center gap-2 rounded-xl py-16 lg:flex"
              style={{ border: "1px dashed var(--border)", color: "var(--muted-foreground)" }}
            >
              <FlaskConical className="h-6 w-6" aria-hidden />
              <p className="text-sm">{TESTING_LABELS.selectCase}</p>
            </div>
          )}
        </div>
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

      {linkTicketsOpen && (
        <LinkTicketToSuiteDialog
          suiteId={id}
          systemId={suite.systemId}
          companyId={suite.companyId}
          linkedTicketIds={ticketLinks.map((l) => l.ticketId)}
          onClose={() => setLinkTicketsOpen(false)}
        />
      )}

      {confirmArchive && (
        <ConfirmDialog
          title={TESTING_LABELS.archiveTitle}
          message={TESTING_LABELS.archiveConfirm}
          actionLabel={TESTING_LABELS.archiveSuite}
          pending={suiteActions.archive.isPending}
          danger
          onClose={() => setConfirmArchive(false)}
          onConfirm={() =>
            suiteActions.archive.mutate(id, { onSuccess: () => setConfirmArchive(false) })
          }
        />
      )}

      {unlinkTicketId && (
        <ConfirmDialog
          title={TESTING_LABELS.unlinkTicket}
          message={TESTING_LABELS.unlinkConfirm}
          actionLabel={TESTING_LABELS.unlinkTicket}
          pending={suiteActions.unlinkTicket.isPending}
          danger
          onClose={() => setUnlinkTicketId(null)}
          onConfirm={() =>
            suiteActions.unlinkTicket.mutate(
              { id, ticketId: unlinkTicketId },
              { onSuccess: () => setUnlinkTicketId(null) },
            )
          }
        />
      )}
    </AppShell>
  );
}

export default function SuiteWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <AppShell>
          <SkeletonList count={5} />
        </AppShell>
      }
    >
      <SuiteWorkspaceContent id={id} />
    </Suspense>
  );
}
