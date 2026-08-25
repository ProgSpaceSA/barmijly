"use client";
import Link from "next/link";
import { FlaskConical, User } from "lucide-react";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { TestCodeBadge, TestStateBadge } from "./TestingBadges";
import { HEALTH_COLORS, PassRateBar, suiteHealth, type SuiteRollup } from "./PassRateBar";
import { TESTING_LABELS } from "@/lib/constants";

export type SuiteCardSuite = {
  id: string;
  suiteNumber?: number | null;
  title: string;
  description?: string | null;
  state: string;
  lastRunAt?: string | null;
  owner?: { id: string; firstName?: string; lastName?: string } | null;
  system?: { id: string; name: string } | null;
  company?: { id: string; name: string; logoUrl?: string | null } | null;
  _count?: { cases?: number; ticketLinks?: number };
  rollup?: SuiteRollup;
};

/**
 * A suite row, in the anatomy of `TicketListCard` — 4px spine, chips, meta row.
 *
 * The spine encodes **health**, not state: what somebody scanning this list
 * wants to know is whether anything is broken, and a suite can be perfectly
 * published and entirely red.
 */
export function SuiteListCard({
  suite,
  currentUserId,
}: {
  suite: SuiteCardSuite;
  currentUserId?: string;
}) {
  const health = suiteHealth(suite.rollup, suite.state);
  const owner = [suite.owner?.firstName, suite.owner?.lastName].filter(Boolean).join(" ");
  const isMine = suite.owner?.id === currentUserId;
  const caseCount = suite._count?.cases ?? 0;
  const openBugs = suite.rollup?.openBugs ?? 0;

  return (
    <Link href={`/test-suites/${suite.id}`} style={{ display: "block" }}>
      <div
        className="flex min-w-0 overflow-hidden rounded-xl transition-all hover:shadow-md"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ background: HEALTH_COLORS[health], borderRadius: "0 4px 4px 0" }}
          aria-hidden
        />

        <div className="min-w-0 flex-1 p-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <TestStateBadge state={suite.state} />
            <TestCodeBadge kind="suite" value={suite.suiteNumber} />
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {caseCount} {TESTING_LABELS.caseCount}
            </span>
            {openBugs > 0 && (
              <span className="text-xs tabular-nums" style={{ color: "#F97316" }}>
                {openBugs} {TESTING_LABELS.openBugs}
              </span>
            )}
          </div>

          <h3 className="brm-row-title font-semibold" style={{ color: "var(--foreground)" }}>
            {suite.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {owner && (
              <span
                className="flex items-center gap-1 text-xs"
                title={TESTING_LABELS.owner}
                style={{ color: "var(--muted-foreground)" }}
              >
                <User className="h-3 w-3" aria-hidden />
                {owner}
                {isMine && ` (${TESTING_LABELS.mine})`}
              </span>
            )}
            {suite.system?.name && (
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {suite.system.name}
              </span>
            )}
            {suite.company && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                <CompanyLogo company={suite.company} size="xs" />
                {suite.company.name}
              </span>
            )}
            {suite.lastRunAt ? (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                <FlaskConical className="h-3 w-3 shrink-0" aria-hidden />
                <span>{TESTING_LABELS.lastRun}:</span>
                <RelativeTime date={suite.lastRunAt} className="text-xs" />
              </span>
            ) : (
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {TESTING_LABELS.neverRun}
              </span>
            )}
          </div>

          <div className="mt-3 max-w-xs">
            <PassRateBar rollup={suite.rollup} state={suite.state} />
          </div>
        </div>
      </div>
    </Link>
  );
}
