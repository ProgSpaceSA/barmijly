"use client";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { TestCaseRow, type TestCaseSummary } from "./TestCaseRow";
import { TESTING_LABELS, TEST_RESULT_LABELS } from "@/lib/constants";

/**
 * The case-panel filters.
 *
 * Result filters cover every lastResult a published case can show, plus draft /
 * mine — which is what replaces a flat cross-suite case page.
 */
export const CASE_FILTERS = [
  { key: "", label: TESTING_LABELS.filterAll },
  { key: "PASS", label: TEST_RESULT_LABELS.PASS },
  { key: "FAIL", label: TEST_RESULT_LABELS.FAIL },
  { key: "BLOCKED", label: TEST_RESULT_LABELS.BLOCKED },
  { key: "SKIPPED", label: TEST_RESULT_LABELS.SKIPPED },
  { key: "NOT_RUN", label: TEST_RESULT_LABELS.NOT_RUN },
  { key: "DRAFT", label: "مسودة" },
  { key: "MINE", label: TESTING_LABELS.mine },
] as const;

export type CaseFilterKey = (typeof CASE_FILTERS)[number]["key"];

/** Filtering is local: the whole suite is already on the page. */
export function filterCases(
  cases: TestCaseSummary[],
  filter: CaseFilterKey,
  search: string,
  currentUserId?: string,
): TestCaseSummary[] {
  const q = search.trim().toLowerCase();
  return cases.filter((c) => {
    if (q && !c.title.toLowerCase().includes(q)) return false;
    if (!filter) return true;
    if (filter === "DRAFT") return c.state === "DRAFT";
    if (filter === "MINE") return c.assignedTo?.id === currentUserId;
    // A draft has never run, so counting it as «لم يُنفَّذ» would bury the
    // published cases that genuinely need somebody to pick them up.
    return c.state !== "DRAFT" && c.lastResult === filter;
  });
}

export function TestCasePanel({
  cases,
  selectedId,
  currentUserId,
  canAuthor = false,
  onSelect,
  onAddCase,
}: {
  cases: TestCaseSummary[];
  selectedId?: string | null;
  currentUserId?: string;
  canAuthor?: boolean;
  onSelect?: (id: string) => void;
  onAddCase?: () => void;
}) {
  const [filter, setFilter] = useState<CaseFilterKey>("");
  const [search, setSearch] = useState("");

  const visible = useMemo(
    () => filterCases(cases, filter, search, currentUserId),
    [cases, filter, search, currentUserId],
  );

  return (
    /*
     * Sizes to content inside the sticky rail (parent caps with max-height).
     * Title / filters / add stay put; the case list grows with rows and only
     * scrolls once it hits the remaining space under that cap.
     */
    <div className="flex w-full flex-col lg:min-h-0 lg:max-h-full">
      <div className="mb-3 shrink-0">
        <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          {TESTING_LABELS.cases}
          <span className="font-brm mr-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
            {cases.length}
          </span>
        </h2>
      </div>

      <div className="mb-3 flex min-w-0 shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ insetInlineStart: 10, color: "var(--muted-foreground)" }}
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={TESTING_LABELS.searchCases}
            aria-label={TESTING_LABELS.searchCases}
            className="h-9 ps-8 text-sm focus-visible:border-input focus-visible:ring-0"
          />
        </div>
        <div className="w-full shrink-0 sm:w-40">
          <ThemeSelect
            value={filter}
            onChange={(v) => setFilter(v as CaseFilterKey)}
            placeholder={TESTING_LABELS.filterAll}
            aria-label={TESTING_LABELS.filterCases}
            triggerClassName="h-9"
            items={CASE_FILTERS.filter((f) => f.key).map(({ key, label }) => ({
              value: key,
              label,
            }))}
          />
        </div>
      </div>

      <div
        className="min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain pe-2.5"
        aria-label={TESTING_LABELS.cases}
      >
        <div className="flex flex-col gap-0.5">
          {!visible.length && (
            <p className="px-2 py-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
              {cases.length ? TESTING_LABELS.noCasesHint : TESTING_LABELS.noCases}
            </p>
          )}
          {visible.map((testCase) => (
            <TestCaseRow
              key={testCase.id}
              testCase={testCase}
              selected={testCase.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      {canAuthor && (
        <button type="button" className="brm-add-row mt-2 shrink-0" onClick={onAddCase}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {TESTING_LABELS.addCase}
        </button>
      )}
    </div>
  );
}
