"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StepEditor } from "./StepEditor";
import { OrderedStepList } from "./OrderedStepList";
import { ResultBadge, TestCodeBadge, TestStateBadge } from "./TestingBadges";
import { SaveStatusButton } from "./SaveStatusButton";
import { TestCaseBugs, type CaseBug } from "./TestCaseBugs";
import { useCaseActions, useCaseSteps } from "@/hooks/useTestCases";
import type { TestStep } from "./StepRow";
import { TESTING_LABELS, TEST_RESULT_LABELS } from "@/lib/constants";
import { formatTicketCode } from "@/lib/utils";

/** The four results a run can end in. NOT_RUN is a starting state, not a verdict. */
const RESULT_ACTIONS = ["PASS", "FAIL", "BLOCKED", "SKIPPED"] as const;

const RESULT_TONES: Record<string, string> = {
  PASS: "#10B981",
  FAIL: "#EF4444",
  BLOCKED: "#F97316",
  SKIPPED: "#6B7280",
};

const SAVE_DELAY_MS = 600;

export type TestCaseDetailData = {
  id: string;
  caseNumber?: number | null;
  suiteId: string;
  title: string;
  description?: string | null;
  preconditions?: string | null;
  expectedResult: string;
  actualResult?: string | null;
  state: string;
  lastResult: string;
  lastRunAt?: string | null;
  lastRunBy?: { firstName?: string; lastName?: string } | null;
  assignedTo?: { id: string; firstName?: string; lastName?: string } | null;
  ticket?: { id: string; title: string; ticketNumber?: number | null } | null;
  suite?: { id?: string; systemId?: string } | null;
  attachments?: { id: string; fileName: string }[];
};

type DraftKey = "title" | "description" | "preconditions" | "expectedResult" | "actualResult";
type Draft = Record<DraftKey, string>;

function toDraft(testCase: TestCaseDetailData): Draft {
  return {
    title: testCase.title,
    description: testCase.description ?? "",
    preconditions: testCase.preconditions ?? "",
    expectedResult: testCase.expectedResult,
    actualResult: testCase.actualResult ?? "",
  };
}

function draftMatches(draft: Draft, testCase: TestCaseDetailData): boolean {
  return (
    draft.title === testCase.title &&
    draft.description === (testCase.description ?? "") &&
    draft.preconditions === (testCase.preconditions ?? "") &&
    draft.expectedResult === testCase.expectedResult &&
    draft.actualResult === (testCase.actualResult ?? "")
  );
}

/**
 * The detail pane of the suite workspace.
 *
 * Editing is inline and autosaves on a short debounce — same cadence as the
 * ticket plan panel and the step rows.
 */
export function TestCaseDetail({
  testCase,
  bugs = [],
  suiteTickets = [],
  systemId,
  canAuthor = false,
  canExecute = false,
  onOpenImage,
  onDeleted,
}: {
  testCase: TestCaseDetailData;
  bugs?: CaseBug[];
  /** Tickets linked to the parent suite — the case may pick one of these. */
  suiteTickets?: { id: string; title: string; ticketNumber?: number | null }[];
  /** Suite system — used when linking an existing bug to this case. */
  systemId?: string;
  canAuthor?: boolean;
  canExecute?: boolean;
  onOpenImage?: (attachmentId: string) => void;
  onDeleted?: () => void;
}) {
  const actions = useCaseActions(testCase.suiteId, testCase.id);
  const { data: steps } = useCaseSteps(testCase.id);
  const [draft, setDraft] = useState(() => toDraft(testCase));
  const [debouncePending, setDebouncePending] = useState(false);
  const [stepsSaving, setStepsSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmUnlinkTicket, setConfirmUnlinkTicket] = useState(false);
  const [ticketPickerOpen, setTicketPickerOpen] = useState(false);
  const [ticketSearch, setTicketSearch] = useState("");

  const archived = testCase.state === "ARCHIVED";
  const editable = canAuthor && !archived;

  const draftRef = useRef(draft);
  const caseRef = useRef(testCase);
  const dirtyRef = useRef(false);
  const debounceRefs = useRef<Partial<Record<DraftKey, ReturnType<typeof setTimeout>>>>({});
  const commitAllRef = useRef<() => void>(() => {});

  useEffect(() => {
    draftRef.current = draft;
  });

  const syncDebounceFlag = () => {
    setDebouncePending(Object.keys(debounceRefs.current).length > 0);
  };

  const commitKey = (key: DraftKey) => {
    const timer = debounceRefs.current[key];
    if (timer) {
      clearTimeout(timer);
      delete debounceRefs.current[key];
    }
    syncDebounceFlag();
    const value = draftRef.current[key].trim();
    const current = (caseRef.current[key as keyof TestCaseDetailData] as string | null) ?? "";
    if (value === current) {
      if (draftMatches(draftRef.current, caseRef.current)) dirtyRef.current = false;
      return;
    }
    if (key === "title" && !value) {
      // Keep the blank draft visible — silently restoring feels like a bug.
      return;
    }
    const caseId = caseRef.current.id;
    actions.update.mutate(
      { id: caseId, [key]: value },
      {
        onSuccess: () => {
          if (caseRef.current.id !== caseId) return;
          if (draftMatches(draftRef.current, caseRef.current)) dirtyRef.current = false;
        },
      },
    );
  };

  const flushAll = () => {
    (Object.keys(debounceRefs.current) as DraftKey[]).forEach((key) => {
      if (debounceRefs.current[key]) commitKey(key);
    });
  };
  useEffect(() => {
    commitAllRef.current = flushAll;
  });

  // Keep caseRef current for same-case field sync; on id change flush first.
  useEffect(() => {
    if (caseRef.current.id !== testCase.id) {
      flushAll();
      dirtyRef.current = false;
      setDebouncePending(false);
      setStepsSaving(false);
      const synced = toDraft(testCase);
      draftRef.current = synced;
      setDraft(synced);
    }
    caseRef.current = testCase;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flush before adopting the new case
  }, [testCase.id]);

  // Sync from the server only when local edits have settled (Linear-style).
  useEffect(() => {
    if (caseRef.current.id !== testCase.id) return;
    caseRef.current = testCase;
    if (actions.update.isPending) return;
    if (dirtyRef.current) {
      if (draftMatches(draftRef.current, testCase)) dirtyRef.current = false;
      else return;
    }
    if (draftMatches(draftRef.current, testCase)) return;
    const synced = toDraft(testCase);
    draftRef.current = synced;
    setDraft(synced);
  }, [
    testCase,
    testCase.title,
    testCase.description,
    testCase.preconditions,
    testCase.expectedResult,
    testCase.actualResult,
    actions.update.isPending,
  ]);

  useEffect(
    () => () => {
      commitAllRef.current();
    },
    [],
  );

  const stepList: TestStep[] = steps ?? [];
  const pending = actions.update.isPending || actions.recordResult.isPending;
  const showSaveStatus = editable || (canExecute && !archived);
  const saving =
    debouncePending || actions.update.isPending || stepsSaving;

  const schedule = (key: DraftKey, value: string) => {
    dirtyRef.current = true;
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      draftRef.current = next;
      return next;
    });
    const existing = debounceRefs.current[key];
    if (existing) clearTimeout(existing);
    debounceRefs.current[key] = setTimeout(() => commitKey(key), SAVE_DELAY_MS);
    setDebouncePending(true);
  };

  const removeMessage =
    testCase.state === "DRAFT"
      ? TESTING_LABELS.deleteCaseConfirm
      : TESTING_LABELS.archiveCaseConfirm;

  return (
    <div className="flex min-w-0 flex-col gap-5 max-lg:pb-28">
      <header className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TestCodeBadge kind="case" value={testCase.caseNumber} />
          <TestStateBadge state={testCase.state} />
          <ResultBadge result={testCase.lastResult} />
          {testCase.lastRunAt && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <span>{TESTING_LABELS.lastRun}:</span>
              <RelativeTime date={testCase.lastRunAt} className="text-xs" />
              {testCase.lastRunBy && (
                <span>
                  · {TESTING_LABELS.runBy}{" "}
                  {[testCase.lastRunBy.firstName, testCase.lastRunBy.lastName]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              )}
            </span>
          )}
          {showSaveStatus && <SaveStatusButton saving={saving} />}
        </div>

        {editable ? (
          <Input
            value={draft.title}
            aria-label={TESTING_LABELS.caseTitle}
            className="h-10 text-base font-semibold"
            onChange={(e) => schedule("title", e.target.value)}
          />
        ) : (
          <h1 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
            {testCase.title}
          </h1>
        )}

        <div className="mt-2 min-w-0">
          <p className="font-brm mb-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
            {TESTING_LABELS.selectCaseTicket}
          </p>
          {testCase.ticket ? (
            <span
              className="inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
              style={{ background: "var(--muted)", color: "var(--foreground)", minHeight: 32 }}
            >
              <Link
                href={`/tickets/${testCase.ticket.id}`}
                className="inline-flex min-w-0 items-center gap-1.5"
                style={{ color: "#4F46E5" }}
              >
                <span dir="ltr" className="ltr-isolate font-brm">
                  {formatTicketCode(testCase.ticket.ticketNumber)}
                </span>
                <span className="truncate">{testCase.ticket.title}</span>
              </Link>
              {editable && (
                <button
                  type="button"
                  onClick={() => setConfirmUnlinkTicket(true)}
                  aria-label={TESTING_LABELS.unlinkTicket}
                  className="shrink-0 rounded p-0.5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </span>
          ) : editable && suiteTickets.length ? (
            <div className="min-w-0">
              {!ticketPickerOpen ? (
                <button
                  type="button"
                  onClick={() => setTicketPickerOpen(true)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium"
                  style={{
                    background: "var(--muted)",
                    color: "var(--foreground)",
                    minHeight: 32,
                  }}
                >
                  {TESTING_LABELS.linkTicket}
                </button>
              ) : (
                <div
                  className="min-w-0 rounded-xl p-2"
                  style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
                >
                  <div className="relative mb-2">
                    <Search
                      className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                      style={{ insetInlineStart: 10, color: "var(--muted-foreground)" }}
                      aria-hidden
                    />
                    <Input
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                      placeholder={TESTING_LABELS.searchTickets}
                      aria-label={TESTING_LABELS.searchTickets}
                      className="h-8 ps-8 text-xs"
                      autoFocus
                    />
                  </div>
                  <ul className="max-h-40 space-y-1 overflow-y-auto" role="listbox" aria-label={TESTING_LABELS.pickTicket}>
                    {suiteTickets
                      .filter((t) => {
                        const q = ticketSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          t.title.toLowerCase().includes(q) ||
                          String(t.ticketNumber ?? "").includes(q)
                        );
                      })
                      .map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            role="option"
                            disabled={actions.update.isPending}
                            onClick={() =>
                              actions.update.mutate(
                                { id: testCase.id, ticketId: t.id },
                                {
                                  onSuccess: () => {
                                    setTicketPickerOpen(false);
                                    setTicketSearch("");
                                  },
                                },
                              )
                            }
                            className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs"
                            style={{ color: "var(--foreground)", minHeight: 36 }}
                          >
                            <span dir="ltr" className="ltr-isolate shrink-0 font-brm">
                              {formatTicketCode(t.ticketNumber)}
                            </span>
                            <span className="truncate">{t.title}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      setTicketPickerOpen(false);
                      setTicketSearch("");
                    }}
                    className="mt-1 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {TESTING_LABELS.cancel}
                  </button>
                </div>
              )}
            </div>
          ) : editable && !suiteTickets.length ? (
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.noSuiteTickets}
            </span>
          ) : null}
        </div>
      </header>

      <Field label={TESTING_LABELS.description}>
        {editable ? (
          <Textarea
            value={draft.description}
            aria-label={TESTING_LABELS.description}
            rows={2}
            className="text-sm"
            onChange={(e) => schedule("description", e.target.value)}
          />
        ) : (
          <Body text={testCase.description} />
        )}
      </Field>

      <Field label={TESTING_LABELS.preconditions}>
        {editable ? (
          <Textarea
            value={draft.preconditions}
            aria-label={TESTING_LABELS.preconditions}
            rows={2}
            className="text-sm"
            onChange={(e) => schedule("preconditions", e.target.value)}
          />
        ) : (
          <Body text={testCase.preconditions} />
        )}
      </Field>

      {editable ? (
        <StepEditor
          steps={stepList}
          owner={{ caseId: testCase.id, suiteId: testCase.suiteId }}
          label={TESTING_LABELS.steps}
          minSteps={0}
          onOpenImage={onOpenImage}
          onSavingChange={setStepsSaving}
        />
      ) : (
        <OrderedStepList
          steps={stepList}
          label={TESTING_LABELS.steps}
          readOnly
          onOpenImage={onOpenImage}
        />
      )}

      <Field label={TESTING_LABELS.expectedResult}>
        {editable ? (
          <Textarea
            value={draft.expectedResult}
            aria-label={TESTING_LABELS.expectedResult}
            rows={2}
            className="text-sm"
            onChange={(e) => schedule("expectedResult", e.target.value)}
          />
        ) : (
          <Body text={testCase.expectedResult} />
        )}
      </Field>

      <Field label={TESTING_LABELS.actualResult}>
        {canExecute && !archived ? (
          <Textarea
            value={draft.actualResult}
            aria-label={TESTING_LABELS.actualResult}
            rows={2}
            className="text-sm"
            onChange={(e) => schedule("actualResult", e.target.value)}
          />
        ) : (
          <Body text={testCase.actualResult} />
        )}
      </Field>

      {!!testCase.attachments?.length && (
        <Field label={TESTING_LABELS.attachments}>
          <ul className="flex flex-wrap gap-2">
            {testCase.attachments.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => onOpenImage?.(file.id)}
                  className="rounded-lg px-2.5 py-1 text-xs"
                  style={{ background: "var(--muted)", color: "var(--foreground)", minHeight: 32 }}
                >
                  {file.fileName}
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}

      <TestCaseBugs
        bugs={bugs}
        caseId={testCase.id}
        suiteId={testCase.suiteId}
        systemId={systemId ?? testCase.suite?.systemId}
        canFileBug={(canAuthor || canExecute) && !archived}
      />

      {!archived && (
        <footer className="brm-case-actions">
          {canExecute && testCase.state === "ACTIVE" && (
            <div
              className="brm-pill-rail flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl p-1"
              style={{ background: "var(--muted)" }}
              role="group"
              aria-label={TESTING_LABELS.recordResult}
            >
              {RESULT_ACTIONS.map((result) => (
                <button
                  key={result}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    actions.recordResult.mutate({
                      id: testCase.id,
                      result,
                      ...(draft.actualResult.trim()
                        ? { actualResult: draft.actualResult.trim() }
                        : {}),
                    })
                  }
                  aria-pressed={testCase.lastResult === result}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:opacity-60"
                  style={{
                    minHeight: 36,
                    background: testCase.lastResult === result ? "var(--card)" : "transparent",
                    color:
                      testCase.lastResult === result
                        ? RESULT_TONES[result]
                        : "var(--muted-foreground)",
                    boxShadow:
                      testCase.lastResult === result ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  {TEST_RESULT_LABELS[result]}
                </button>
              ))}
            </div>
          )}

          {canAuthor && testCase.state === "DRAFT" && (
            <button
              type="button"
              disabled={actions.publish.isPending}
              onClick={() => actions.publish.mutate(testCase.id)}
              className="brm-case-action-primary"
            >
              {TESTING_LABELS.publishCase}
            </button>
          )}

          {canAuthor && (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              aria-label={TESTING_LABELS.deleteCase}
              title={TESTING_LABELS.deleteCase}
              className="brm-case-action-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </footer>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title={testCase.state === "DRAFT" ? TESTING_LABELS.deleteTitle : TESTING_LABELS.archiveTitle}
          message={removeMessage}
          actionLabel={testCase.state === "DRAFT" ? TESTING_LABELS.delete : TESTING_LABELS.archiveTitle}
          pending={actions.remove.isPending}
          danger
          onClose={() => setConfirmRemove(false)}
          onConfirm={() =>
            actions.remove.mutate(testCase.id, {
              onSuccess: () => {
                setConfirmRemove(false);
                onDeleted?.();
              },
            })
          }
        />
      )}

      {confirmUnlinkTicket && (
        <ConfirmDialog
          title={TESTING_LABELS.unlinkTicket}
          message={TESTING_LABELS.unlinkConfirm}
          actionLabel={TESTING_LABELS.unlinkTicket}
          pending={actions.update.isPending}
          danger
          onClose={() => setConfirmUnlinkTicket(false)}
          onConfirm={() =>
            actions.update.mutate(
              { id: testCase.id, ticketId: null },
              { onSuccess: () => setConfirmUnlinkTicket(false) },
            )
          }
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-brm mb-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function Body({ text }: { text?: string | null }) {
  return (
    <p
      className="text-sm leading-relaxed"
      style={{ color: text ? "var(--foreground)" : "var(--muted-foreground)" }}
    >
      {text || "—"}
    </p>
  );
}
