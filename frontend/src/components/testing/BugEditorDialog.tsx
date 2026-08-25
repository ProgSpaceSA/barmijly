"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { StepEditor } from "./StepEditor";
import { DraftReproSteps, newDraftStep, persistDraftSteps } from "./DraftReproSteps";
import { PromoteBugDialog } from "./PromoteBugDialog";
import type { TestStep } from "./StepRow";
import { useBug, useBugActions } from "@/hooks/useBugs";
import { useBugSteps } from "@/hooks/useTestCases";
import {
  BUG_SEVERITY_LABELS,
  PRIORITY_LABELS,
  SELECT_PLACEHOLDERS,
  TESTING_LABELS,
} from "@/lib/constants";
import { formatCaseCode } from "@/lib/utils";
import { useRouter } from "next/navigation";

type CaseContext = {
  caseId: string;
  caseNumber?: number | null;
  caseTitle: string;
  suiteTitle?: string;
};

/**
 * One dialog for both ways a bug gets filed.
 *
 * Opened from a case it carries a context strip naming the suite and case, and
 * inherits their scope; removing the strip makes the bug standalone and the
 * company/system pickers appear instead. Two dialogs would mean two versions of
 * the same eight fields, and they would drift.
 *
 * Repro steps use the same ordered list as a test case. On a new bug they are
 * edited locally and posted after the bug row is created — no save-first gate.
 */
export function BugEditorDialog({
  bugId,
  caseContext,
  ticketId,
  defaultSystemId,
  defaultCompanyId,
  onClose,
  onSaved,
}: {
  /** Editing an existing bug. Omit to file a new one. */
  bugId?: string;
  caseContext?: CaseContext;
  /** Link the new bug to an existing ticket (ticket page) — not a promote. */
  ticketId?: string;
  defaultSystemId?: string;
  defaultCompanyId?: string;
  onClose: () => void;
  onSaved?: (bug: { id: string }) => void;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [savedId, setSavedId] = useState<string | undefined>(bugId);
  const [linkedCase, setLinkedCase] = useState<CaseContext | undefined>(caseContext);
  const [promoteAfterSave, setPromoteAfterSave] = useState<{
    id: string;
    bugNumber?: number | null;
    title: string;
  } | null>(null);
  const [draftSteps, setDraftSteps] = useState<TestStep[]>(() =>
    bugId ? [] : [newDraftStep(0)],
  );
  const draftStepsRef = useRef(draftSteps);
  useEffect(() => {
    draftStepsRef.current = draftSteps;
  }, [draftSteps]);
  const [stepsSaving, setStepsSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    expectedBehavior: "",
    actualBehavior: "",
    environment: "",
    severity: "MAJOR",
    priority: "",
    systemId: defaultSystemId ?? "",
    companyId: defaultCompanyId ?? "",
  });

  const { data: existing } = useBug(savedId ?? "");
  const { data: steps } = useBugSteps(savedId ?? "");
  const actions = useBugActions(savedId);

  const standalone = !linkedCase;

  const { data: companies } = useQuery({
    queryKey: qk.companies.list(),
    queryFn: () => api.get("/companies").then((r) => r.data),
    staleTime: 60_000,
    enabled: standalone,
  });
  const { data: systems } = useQuery({
    queryKey: qk.systems.byCompany(form.companyId),
    queryFn: () => api.get(`/systems?companyId=${form.companyId}`).then((r) => r.data),
    enabled: standalone && !!form.companyId,
  });

  // Editing: the server row is the truth, and it lands after the first render.
  useEffect(() => {
    if (!existing) return;
    setForm((prev) => ({
      ...prev,
      title: existing.title ?? "",
      description: existing.description ?? "",
      expectedBehavior: existing.expectedBehavior ?? "",
      actualBehavior: existing.actualBehavior ?? "",
      environment: existing.environment ?? "",
      severity: existing.severity ?? "MAJOR",
      priority: existing.priority ?? "",
      systemId: existing.systemId ?? prev.systemId,
      companyId: existing.companyId ?? prev.companyId,
    }));
  }, [existing]);

  const companyList: { id: string; name: string }[] = Array.isArray(companies)
    ? companies
    : (companies?.data ?? []);
  const systemList: { id: string; name: string }[] = Array.isArray(systems)
    ? systems
    : (systems?.data ?? []);

  const pending =
    actions.create.isPending ||
    actions.update.isPending ||
    actions.promote.isPending ||
    stepsSaving;

  const ready =
    form.title.trim().length > 0 &&
    form.description.trim().length > 0 &&
    (linkedCase ? true : Boolean(form.systemId && form.companyId));

  const payload = (includeCaseLink: boolean) => ({
    title: form.title.trim(),
    description: form.description.trim(),
    severity: form.severity,
    ...(form.priority ? { priority: form.priority } : {}),
    ...(form.expectedBehavior ? { expectedBehavior: form.expectedBehavior } : {}),
    ...(form.actualBehavior ? { actualBehavior: form.actualBehavior } : {}),
    ...(form.environment ? { environment: form.environment } : {}),
    ...(includeCaseLink
      ? linkedCase
        ? { testCaseId: linkedCase.caseId }
        : { systemId: form.systemId, companyId: form.companyId }
      : {}),
    ...(includeCaseLink && ticketId ? { ticketId } : {}),
  });

  const save = async (then?: "promote" | "close") => {
    if (!ready) return;
    const isNew = !savedId;
    const bug = savedId
      ? await actions.update.mutateAsync({ id: savedId, ...payload(false) })
      : await actions.create.mutateAsync(payload(true));
    setSavedId(bug.id);
    if (isNew) {
      const drafts = draftStepsRef.current;
      if (drafts.length) {
        await persistDraftSteps(bug.id, drafts);
        setDraftSteps([]);
        await qc.invalidateQueries({ queryKey: qk.bugs.steps(bug.id) });
      }
    }
    onSaved?.(bug);
    if (then === "promote") {
      setPromoteAfterSave({
        id: bug.id,
        bugNumber: bug.bugNumber,
        title: bug.title ?? form.title.trim(),
      });
      return;
    }
    if (then === "close") onClose();
  };

  const hasTicket = Boolean(existing?.ticketId || ticketId);

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={savedId ? TESTING_LABELS.bugTitle : TESTING_LABELS.newBug}
        className="brm-modal flex max-h-[90vh] w-full max-w-full flex-col overflow-hidden rounded-2xl sm:max-w-lg"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
            {savedId ? TESTING_LABELS.bugTitle : TESTING_LABELS.newBug}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label={TESTING_LABELS.close}
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {linkedCase ? (
            <div
              className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: "var(--muted)" }}
            >
              <span
                className="min-w-0 flex-1 truncate text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                {TESTING_LABELS.fromCase}:{" "}
                <span dir="ltr" className="ltr-isolate font-brm">
                  {formatCaseCode(linkedCase.caseNumber)}
                </span>{" "}
                {linkedCase.caseTitle}
                {linkedCase.suiteTitle ? ` · ${linkedCase.suiteTitle}` : ""}
              </span>
              {!savedId && (
                <button
                  type="button"
                  onClick={() => setLinkedCase(undefined)}
                  aria-label={TESTING_LABELS.clearCaseContext}
                  title={TESTING_LABELS.clearCaseContext}
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={SELECT_PLACEHOLDERS.company}>
                <ThemeSelect
                  value={form.companyId}
                  onChange={(v) => {
                    set("companyId", v);
                    set("systemId", "");
                  }}
                  placeholder={SELECT_PLACEHOLDERS.company}
                  items={companyList.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
              <Field label={SELECT_PLACEHOLDERS.system}>
                <ThemeSelect
                  value={form.systemId}
                  onChange={(v) => set("systemId", v)}
                  placeholder={SELECT_PLACEHOLDERS.system}
                  items={systemList.map((sys) => ({ value: sys.id, label: sys.name }))}
                  disabled={!form.companyId}
                />
              </Field>
            </div>
          )}

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
            <StepEditor
              steps={steps ?? []}
              owner={{ bugId: savedId }}
              label={TESTING_LABELS.reproSteps}
              onSavingChange={setStepsSaving}
            />
          ) : (
            <DraftReproSteps steps={draftSteps} onChange={setDraftSteps} />
          )}
        </div>

        <div
          className="flex shrink-0 flex-wrap gap-2 px-5 py-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={() => void save()}
            disabled={!ready || pending}
            title={TESTING_LABELS.saveDraftHint}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            {TESTING_LABELS.saveDraft}
          </button>
          <button
            type="button"
            onClick={() => void save("close")}
            disabled={!ready || pending}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{
              background: "rgba(79,70,229,0.12)",
              color: "#818CF8",
              border: "1px solid rgba(79,70,229,0.35)",
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
              className="w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 sm:w-auto sm:flex-1"
              style={{
                background: "rgba(239,68,68,0.10)",
                color: "#EF4444",
                border: "1px solid rgba(239,68,68,0.30)",
              }}
            >
              {TESTING_LABELS.saveAndPromote}
            </button>
          )}
        </div>
      </div>

      {promoteAfterSave && (
        <PromoteBugDialog
          bug={promoteAfterSave}
          pending={actions.promote.isPending}
          onClose={() => {
            setPromoteAfterSave(null);
            onClose();
          }}
          onConfirm={(title) => {
            void actions.promote
              .mutateAsync({ id: promoteAfterSave.id, title })
              .then((result: { ticket: { id: string } }) => {
                setPromoteAfterSave(null);
                onClose();
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
