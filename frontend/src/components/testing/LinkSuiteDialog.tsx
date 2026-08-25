"use client";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TestCodeBadge, TestStateBadge } from "./TestingBadges";
import { PassRateBar, type SuiteRollup } from "./PassRateBar";
import { useSuiteActions, useTestSuites } from "@/hooks/useTestSuites";
import { TESTING_LABELS } from "@/lib/constants";

type Suite = {
  id: string;
  suiteNumber?: number | null;
  title: string;
  state: string;
  rollup?: SuiteRollup;
};

/**
 * «ربط بمجموعة» from the ticket page.
 *
 * Scoped to the ticket's own system: a suite elsewhere would be one the ticket
 * has no relationship to, and linking it would put a row on both pages that
 * neither can explain. Already-linked suites are shown but not selectable —
 * hiding them would read as "no suites here" on a ticket that has several.
 */
export function LinkSuiteDialog({
  ticketId,
  systemId,
  linkedSuiteIds = [],
  onClose,
}: {
  ticketId: string;
  systemId: string;
  linkedSuiteIds?: string[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useTestSuites({ systemId, limit: "50" });
  const actions = useSuiteActions();

  const already = new Set(linkedSuiteIds);
  const q = search.trim().toLowerCase();
  const suites: Suite[] = (data?.data ?? []).filter((s: Suite) =>
    q ? s.title.toLowerCase().includes(q) : true,
  );

  const link = (suiteId: string) =>
    actions.linkTicket.mutate({ id: suiteId, ticketId }, { onSuccess: onClose });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TESTING_LABELS.linkSuiteFromTicket}
        className="brm-modal flex max-h-[85vh] w-full max-w-full flex-col overflow-hidden rounded-2xl sm:max-w-lg"
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
            {TESTING_LABELS.linkSuiteFromTicket}
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

        <div className="shrink-0 px-5 pt-4">
          <div className="relative">
            <Search
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ insetInlineStart: 10, color: "var(--muted-foreground)" }}
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={TESTING_LABELS.searchSuites}
              aria-label={TESTING_LABELS.searchSuites}
              className="h-9 ps-8 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-5">
          {isLoading && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.loading}
            </p>
          )}

          {!isLoading && !suites.length && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.noSuitesInSystem}
            </p>
          )}

          {suites.map((suite) => {
            const linked = already.has(suite.id);
            return (
              <div
                key={suite.id}
                className="flex w-full min-w-0 flex-wrap items-center gap-2 rounded-lg px-2.5 py-2"
                style={{
                  background: "var(--muted)",
                  minHeight: 44,
                  opacity: linked || actions.linkTicket.isPending ? 0.6 : 1,
                }}
              >
                <TestCodeBadge kind="suite" value={suite.suiteNumber} />
                <button
                  type="button"
                  disabled={linked || actions.linkTicket.isPending}
                  onClick={() => link(suite.id)}
                  className="min-w-0 flex-1 truncate text-start text-xs disabled:cursor-not-allowed"
                  style={{ color: "var(--foreground)" }}
                >
                  {suite.title}
                </button>
                <TestStateBadge state={suite.state} />
                <span className="w-full sm:w-24">
                  <PassRateBar rollup={suite.rollup} state={suite.state} showLabel={false} />
                </span>
                {linked && (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {TESTING_LABELS.alreadyLinked}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
