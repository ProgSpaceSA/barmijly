"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { useSuiteActions } from "@/hooks/useTestSuites";
import { SELECT_PLACEHOLDERS, TESTING_LABELS } from "@/lib/constants";

/**
 * Creating a suite: a title and the system it hangs off.
 *
 * The company/system pair is asked for the same way a new ticket asks for it,
 * because it is the same question — it decides who can see the suite at all.
 */
export function SuiteEditorDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const actions = useSuiteActions();
  const [form, setForm] = useState({ title: "", description: "", companyId: "", systemId: "" });

  const { data: companies } = useQuery({
    queryKey: qk.companies.list(),
    queryFn: () => api.get("/companies").then((r) => r.data),
    staleTime: 60_000,
  });
  const { data: systems } = useQuery({
    queryKey: qk.systems.byCompany(form.companyId),
    queryFn: () => api.get(`/systems?companyId=${form.companyId}`).then((r) => r.data),
    enabled: !!form.companyId,
  });

  const companyList: { id: string; name: string }[] = Array.isArray(companies)
    ? companies
    : (companies?.data ?? []);
  const systemList: { id: string; name: string }[] = Array.isArray(systems)
    ? systems
    : (systems?.data ?? []);

  const ready = form.title.trim() && form.companyId && form.systemId;
  const pending = actions.create.isPending;

  const submit = async () => {
    if (!ready) return;
    const suite = await actions.create.mutateAsync({
      title: form.title.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      companyId: form.companyId,
      systemId: form.systemId,
    });
    onClose();
    // Straight into the workspace: an empty suite is not the destination.
    router.push(`/test-suites/${suite.id}`);
  };

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
        aria-label={TESTING_LABELS.newSuite}
        className="brm-modal w-full max-w-full overflow-hidden rounded-2xl sm:max-w-lg"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
            {TESTING_LABELS.newSuite}
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

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="font-brm mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                {SELECT_PLACEHOLDERS.company}
              </p>
              <ThemeSelect
                value={form.companyId}
                onChange={(v) => {
                  set("companyId", v);
                  set("systemId", "");
                }}
                placeholder={SELECT_PLACEHOLDERS.company}
                items={companyList.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div>
              <p className="font-brm mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                {SELECT_PLACEHOLDERS.system}
              </p>
              <ThemeSelect
                value={form.systemId}
                onChange={(v) => set("systemId", v)}
                placeholder={SELECT_PLACEHOLDERS.system}
                items={systemList.map((s) => ({ value: s.id, label: s.name }))}
                disabled={!form.companyId}
              />
            </div>
          </div>

          <div>
            <p className="font-brm mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.caseTitle}
            </p>
            <Input
              value={form.title}
              aria-label={TESTING_LABELS.newSuite}
              className="h-9 text-sm"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <p className="font-brm mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.description}
            </p>
            <Textarea
              value={form.description}
              aria-label={TESTING_LABELS.description}
              rows={3}
              className="text-sm"
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready || pending}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{
              minHeight: 44,
              background: "rgba(79,70,229,0.12)",
              color: "#818CF8",
              border: "1px solid rgba(79,70,229,0.35)",
            }}
          >
            {pending ? TESTING_LABELS.saving : TESTING_LABELS.save}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ minHeight: 44, border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            {TESTING_LABELS.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
