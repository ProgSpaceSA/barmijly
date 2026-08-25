"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bug as BugIcon, ChevronDown, ChevronRight, Link2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { BugStatusBadge, SeverityBadge, TestCodeBadge } from "./TestingBadges";
import { StepEditor } from "./StepEditor";
import { DraftReproSteps, newDraftStep, persistDraftSteps } from "./DraftReproSteps";
import { LinkExistingBugDialog } from "./LinkExistingBugDialog";
import { PromoteBugDialog } from "./PromoteBugDialog";
import type { TestStep } from "./StepRow";
import { useBugActions } from "@/hooks/useBugs";
import { useBugSteps } from "@/hooks/useTestCases";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { refreshTestingWorkspace } from "@/hooks/useTestSuites";
import {
  BUG_SEVERITY_LABELS,
  PRIORITY_LABELS,
  SELECT_PLACEHOLDERS,
  TESTING_LABELS,
  bugStatusColor,
} from "@/lib/constants";

export type CaseBug = {
  id: string;
  bugNumber?: number | null;
  title: string;
  severity: string;
  status: string;
  ticketId?: string | null;
  testCaseId?: string | null;
  description?: string | null;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  environment?: string | null;
  priority?: string | null;
};

type BugDraft = {
  title: string;
  description: string;
  expectedBehavior: string;
  actualBehavior: string;
  environment: string;
  severity: string;
  priority: string;
};

const emptyDraft = (): BugDraft => ({
  title: "",
  description: "",
  expectedBehavior: "",
  actualBehavior: "",
  environment: "",
  severity: "MAJOR",
  priority: "",
});

function draftFromBug(bug: CaseBug): BugDraft {
  return {
    title: bug.title ?? "",
    description: bug.description ?? "",
    expectedBehavior: bug.expectedBehavior ?? "",
    actualBehavior: bug.actualBehavior ?? "",
    environment: bug.environment ?? "",
    severity: bug.severity ?? "MAJOR",
    priority: bug.priority ?? "",
  };
}

/**
 * The bugs section under a test case — inline create/edit, no modal.
 *
 * Collapsed rows show a preview; expanding opens the same fields as the
 * standalone bug dialog. Filing a new bug expands an empty form in place.
 *
 * `displayBugs` mirrors props but also accepts optimistic link/unlink so the
 * pane never waits on a cache race.
 */
export function TestCaseBugs({
  bugs,
  caseId,
  suiteId,
  systemId,
  canFileBug = false,
}: {
  bugs: CaseBug[];
  caseId: string;
  suiteId?: string;
  systemId?: string;
  canFileBug?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [composing, setComposing] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayBugs, setDisplayBugs] = useState(bugs);

  useEffect(() => {
    setDisplayBugs(bugs);
  }, [bugs]);

  const refreshCase = async () => {
    await refreshTestingWorkspace(qc, { suiteId, caseId });
  };

  return (
    <section className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 py-1.5 text-start"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        )}
        <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          {TESTING_LABELS.bugs}
        </span>
        <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
          {displayBugs.length}
        </span>
      </button>

      {open && (
        <div className="mt-1 flex flex-col gap-1.5">
          {!displayBugs.length && !composing && (
            <p className="py-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.noBugs}
            </p>
          )}

          {displayBugs.map((bug) => (
            <BugRow
              key={bug.id}
              bug={bug}
              caseId={caseId}
              suiteId={suiteId}
              canUnlink={canFileBug}
              expanded={expandedId === bug.id}
              onToggle={() =>
                setExpandedId((id) => (id === bug.id ? null : bug.id))
              }
              onUnlinked={() => {
                setDisplayBugs((list) => list.filter((b) => b.id !== bug.id));
                refreshCase();
              }}
            />
          ))}

          {composing && (
            <InlineBugForm
              caseId={caseId}
              onCancel={() => setComposing(false)}
              onSaved={(created) => {
                setComposing(false);
                if (created) {
                  setDisplayBugs((list) =>
                    list.some((b) => b.id === created.id) ? list : [created, ...list],
                  );
                }
                refreshCase();
              }}
            />
          )}

          {canFileBug && !composing && (
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                className="brm-add-row"
                onClick={() => {
                  setExpandedId(null);
                  setComposing(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {TESTING_LABELS.newBug}
              </button>
              <button
                type="button"
                className="brm-add-row"
                onClick={() => setLinkOpen(true)}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                {TESTING_LABELS.linkExistingBug}
              </button>
            </div>
          )}
        </div>
      )}

      {linkOpen && (
        <LinkExistingBugDialog
          caseId={caseId}
          suiteId={suiteId}
          systemId={systemId}
          linkedIds={displayBugs.map((b) => b.id)}
          onClose={() => setLinkOpen(false)}
          onLinked={(linked) => {
            setDisplayBugs((list) =>
              list.some((b) => b.id === linked.id)
                ? list
                : [
                    {
                      id: linked.id,
                      bugNumber: linked.bugNumber,
                      title: linked.title,
                      severity: linked.severity,
                      status: linked.status,
                      ticketId: linked.ticketId,
                      testCaseId: linked.testCaseId,
                      description: linked.description,
                    },
                    ...list,
                  ],
            );
            refreshCase();
          }}
        />
      )}
    </section>
  );
}

function BugRow({
  bug,
  caseId,
  suiteId,
  canUnlink,
  expanded,
  onToggle,
  onUnlinked,
}: {
  bug: CaseBug;
  caseId: string;
  suiteId?: string;
  canUnlink?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onUnlinked: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const actions = useBugActions(bug.id, caseId);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  return (
    <div
      className="min-w-0 overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--border)", background: "var(--muted)" }}
    >
      {/* Phone: title row + badges below. Desktop (lg+): single row as before. */}
      <div className="flex w-full min-w-0 flex-col gap-1.5 px-2.5 py-2 lg:flex-row lg:items-center lg:gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? TESTING_LABELS.collapseBug : TESTING_LABELS.expandBug}
            className="inline-flex shrink-0 items-center gap-1.5 text-start"
            style={{ color: "var(--foreground)" }}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <BugIcon
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: bugStatusColor(bug.status) }}
              aria-hidden
            />
          </button>
          <Link href={`/bugs/${bug.id}`} className="shrink-0">
            <TestCodeBadge kind="bug" value={bug.bugNumber} />
          </Link>
          <Link
            href={`/bugs/${bug.id}`}
            className="min-w-0 flex-1 truncate text-start text-xs font-medium"
            style={{ color: "var(--foreground)" }}
          >
            {bug.title}
          </Link>
          {canUnlink && (
            <button
              type="button"
              onClick={() => setUnlinkOpen(true)}
              aria-label={TESTING_LABELS.unlinkCaseFromBug}
              className="shrink-0 rounded p-1 lg:hidden"
              style={{ color: "var(--muted-foreground)", minHeight: 32, minWidth: 32 }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 ps-8 lg:shrink-0 lg:ps-0">
          <SeverityBadge severity={bug.severity} />
          <BugStatusBadge status={bug.status} />
          {!bug.ticketId && (
            <button
              type="button"
              onClick={() => setPromoteOpen(true)}
              disabled={actions.promote.isPending}
              title={TESTING_LABELS.promoteHint}
              className="rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-60"
              style={{ background: "rgba(79,70,229,0.10)", color: "#4F46E5", minHeight: 32 }}
            >
              {actions.promote.isPending ? TESTING_LABELS.promoting : TESTING_LABELS.promote}
            </button>
          )}
        </div>
        {canUnlink && (
          <button
            type="button"
            onClick={() => setUnlinkOpen(true)}
            aria-label={TESTING_LABELS.unlinkCaseFromBug}
            className="hidden shrink-0 rounded p-1 lg:inline-flex"
            style={{ color: "var(--muted-foreground)", minHeight: 32, minWidth: 32 }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-2.5 pb-3" style={{ borderTop: "1px solid var(--border)" }}>
          <InlineBugForm
            caseId={caseId}
            bug={bug}
            onCancel={onToggle}
            onSaved={() => onToggle()}
          />
        </div>
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

      {unlinkOpen && (
        <ConfirmDialog
          title={TESTING_LABELS.unlinkCaseFromBug}
          message={TESTING_LABELS.unlinkCaseFromBugConfirm}
          actionLabel={TESTING_LABELS.unlinkCaseFromBug}
          pending={actions.update.isPending}
          danger
          onClose={() => setUnlinkOpen(false)}
          onConfirm={() => {
            void actions.update
              .mutateAsync({ id: bug.id, testCaseId: null })
              .then(async () => {
                setUnlinkOpen(false);
                toast.success(TESTING_LABELS.saved);
                await refreshTestingWorkspace(qc, { suiteId, caseId });
                onUnlinked();
              });
          }}
        />
      )}
    </div>
  );
}

function InlineBugForm({
  caseId,
  bug,
  onCancel,
  onSaved,
}: {
  caseId: string;
  bug?: CaseBug;
  onCancel: () => void;
  onSaved: (created?: CaseBug) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [savedId, setSavedId] = useState<string | undefined>(bug?.id);
  const [form, setForm] = useState<BugDraft>(() => (bug ? draftFromBug(bug) : emptyDraft()));
  const [draftSteps, setDraftSteps] = useState<TestStep[]>(() =>
    bug ? [] : [newDraftStep(0)],
  );
  const draftStepsRef = useRef(draftSteps);
  useEffect(() => {
    draftStepsRef.current = draftSteps;
  }, [draftSteps]);
  const [promoteTarget, setPromoteTarget] = useState<{
    id: string;
    bugNumber?: number | null;
    title: string;
  } | null>(null);
  const actions = useBugActions(savedId, caseId);
  const { data: steps } = useBugSteps(savedId ?? "");

  useEffect(() => {
    if (!bug) return;
    setForm(draftFromBug(bug));
    setSavedId(bug.id);
  }, [bug]);

  const pending =
    actions.create.isPending || actions.update.isPending || actions.promote.isPending;
  const ready = form.title.trim().length > 0 && form.description.trim().length > 0;
  const hasTicket = Boolean(bug?.ticketId);

  const payload = (includeCaseLink: boolean) => ({
    title: form.title.trim(),
    description: form.description.trim(),
    severity: form.severity,
    ...(form.priority ? { priority: form.priority } : {}),
    ...(form.expectedBehavior ? { expectedBehavior: form.expectedBehavior } : {}),
    ...(form.actualBehavior ? { actualBehavior: form.actualBehavior } : {}),
    ...(form.environment ? { environment: form.environment } : {}),
    ...(includeCaseLink ? { testCaseId: caseId } : {}),
  });

  const save = async (then?: "promote" | "close") => {
    if (!ready) return;
    const isNew = !savedId;
    const saved = savedId
      ? await actions.update.mutateAsync({ id: savedId, ...payload(false) })
      : await actions.create.mutateAsync(payload(true));
    setSavedId(saved.id);
    if (isNew) {
      const drafts = draftStepsRef.current;
      if (drafts.length) {
        await persistDraftSteps(saved.id, drafts);
        setDraftSteps([]);
        await qc.refetchQueries({ queryKey: qk.bugs.steps(saved.id) });
      }
    }
    if (!isNew && then !== "promote") toast.success(TESTING_LABELS.saved);
    if (then === "promote") {
      setPromoteTarget({
        id: saved.id,
        bugNumber: saved.bugNumber ?? bug?.bugNumber,
        title: saved.title ?? form.title.trim(),
      });
      return;
    }
    if (then === "close" || !bug) {
      onSaved(
        isNew
          ? {
              id: saved.id,
              bugNumber: saved.bugNumber,
              title: saved.title ?? form.title.trim(),
              severity: saved.severity ?? form.severity,
              status: saved.status ?? "OPEN",
              ticketId: saved.ticketId ?? null,
              description: saved.description ?? form.description.trim(),
              expectedBehavior: saved.expectedBehavior ?? form.expectedBehavior,
              actualBehavior: saved.actualBehavior ?? form.actualBehavior,
              environment: saved.environment ?? form.environment,
              priority: saved.priority ?? (form.priority || null),
            }
          : undefined,
      );
    }
  };

  const set = (key: keyof BugDraft, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
          {bug ? TESTING_LABELS.editBug : TESTING_LABELS.newBug}
        </p>
        {!bug && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={TESTING_LABELS.cancel}
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

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
          rows={2}
          className="text-sm"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={TESTING_LABELS.severity}>
          <ThemeSelect
            value={form.severity}
            onChange={(v) => set("severity", v || "MAJOR")}
            placeholder={TESTING_LABELS.severity}
            items={Object.entries(BUG_SEVERITY_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label={SELECT_PLACEHOLDERS.priority}>
          <ThemeSelect
            value={form.priority}
            onChange={(v) => set("priority", v)}
            placeholder={SELECT_PLACEHOLDERS.priority}
            items={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
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

      {savedId ? (
        <StepEditor steps={steps ?? []} owner={{ bugId: savedId }} label={TESTING_LABELS.reproSteps} />
      ) : (
        <DraftReproSteps steps={draftSteps} onChange={setDraftSteps} />
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save("close")}
          disabled={!ready || pending}
          className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
          style={{
            minHeight: 40,
            background: "#4F46E5",
            color: "#fff",
          }}
        >
          {pending ? TESTING_LABELS.saving : TESTING_LABELS.save}
        </button>
        {!hasTicket && (
          <button
            type="button"
            onClick={() => void save("promote")}
            disabled={!ready || pending}
            title={TESTING_LABELS.promoteHint}
            className="rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60"
            style={{
              minHeight: 40,
              background: "rgba(239,68,68,0.10)",
              color: "#EF4444",
              border: "1px solid rgba(239,68,68,0.30)",
            }}
          >
            {TESTING_LABELS.saveAndPromote}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60"
          style={{ minHeight: 40, border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
        >
          {TESTING_LABELS.cancel}
        </button>
      </div>

      {promoteTarget && (
        <PromoteBugDialog
          bug={promoteTarget}
          pending={actions.promote.isPending}
          onClose={() => setPromoteTarget(null)}
          onConfirm={(title) => {
            void actions.promote
              .mutateAsync({ id: promoteTarget.id, title })
              .then((result: { ticket: { id: string } }) => {
                setPromoteTarget(null);
                onSaved();
                router.push(`/tickets/${result.ticket.id}`);
              });
          }}
        />
      )}
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
