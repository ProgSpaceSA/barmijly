import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestCasePanel, filterCases } from "./TestCasePanel";
import type { TestCaseSummary } from "./TestCaseRow";
import { TESTING_LABELS } from "@/lib/constants";

const cases: TestCaseSummary[] = [
  { id: "c1", caseNumber: 1, title: "دخول ناجح", state: "ACTIVE", lastResult: "PASS" },
  { id: "c2", caseNumber: 2, title: "دخول خاطئ", state: "ACTIVE", lastResult: "FAIL" },
  { id: "c3", caseNumber: 3, title: "قفل الحساب", state: "ACTIVE", lastResult: "BLOCKED" },
  { id: "c4", caseNumber: 4, title: "استعادة كلمة المرور", state: "ACTIVE", lastResult: "NOT_RUN" },
  {
    id: "c5",
    caseNumber: 5,
    title: "تسجيل جديد",
    state: "DRAFT",
    lastResult: "NOT_RUN",
    assignedTo: { id: "me", firstName: "أنا" },
  },
];

describe("filterCases", () => {
  it("returns everything with no filter", () => {
    expect(filterCases(cases, "", "")).toHaveLength(5);
  });

  it.each([
    ["PASS", ["c1"]],
    ["FAIL", ["c2"]],
    ["BLOCKED", ["c3"]],
    ["NOT_RUN", ["c4"]],
  ] as const)("narrows to %s", (filter, ids) => {
    expect(filterCases(cases, filter, "").map((c) => c.id)).toEqual(ids);
  });

  it("keeps drafts out of «لم يُنفَّذ» — a draft was never meant to run yet", () => {
    expect(filterCases(cases, "NOT_RUN", "").map((c) => c.id)).not.toContain("c5");
  });

  it("has its own drafts filter", () => {
    expect(filterCases(cases, "DRAFT", "").map((c) => c.id)).toEqual(["c5"]);
  });

  it("reads «المُسندة إليّ» off the current user", () => {
    expect(filterCases(cases, "MINE", "", "me").map((c) => c.id)).toEqual(["c5"]);
    expect(filterCases(cases, "MINE", "", "someone-else")).toHaveLength(0);
  });

  it("searches the title, case-insensitively", () => {
    expect(filterCases(cases, "", "دخول")).toHaveLength(2);
  });

  it("combines a search with a filter rather than replacing it", () => {
    expect(filterCases(cases, "FAIL", "دخول").map((c) => c.id)).toEqual(["c2"]);
  });
});

describe("TestCasePanel", () => {
  it("shows «إضافة حالة اختبار» to an author — not a top «حالة جديدة»", () => {
    render(<TestCasePanel cases={cases} canAuthor />);
    expect(screen.queryByRole("button", { name: TESTING_LABELS.newCase })).toBeNull();
    expect(screen.getByRole("button", { name: TESTING_LABELS.addCase })).toBeInTheDocument();
  });

  it("hides the add affordance from someone who cannot author", () => {
    render(<TestCasePanel cases={cases} canAuthor={false} />);
    expect(screen.queryByRole("button", { name: TESTING_LABELS.newCase })).toBeNull();
    expect(screen.queryByRole("button", { name: TESTING_LABELS.addCase })).toBeNull();
  });

  it("marks the selected row for assistive tech, not only with a background", () => {
    render(<TestCasePanel cases={cases} selectedId="c2" />);
    expect(screen.getByRole("button", { name: /دخول خاطئ/ })).toHaveAttribute("aria-current", "true");
  });

  it("hands the picked case id to the parent", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TestCasePanel cases={cases} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /قفل الحساب/ }));
    expect(onSelect).toHaveBeenCalledWith("c3");
  });

  it("narrows the list when a filter is picked", async () => {
    const user = userEvent.setup();
    render(<TestCasePanel cases={cases} />);
    expect(screen.getByRole("button", { name: /دخول ناجح/ })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterCases }));
    await user.click(await screen.findByRole("option", { name: "فشل" }));

    expect(screen.queryByRole("button", { name: /دخول ناجح/ })).toBeNull();
    expect(screen.getByRole("button", { name: /دخول خاطئ/ })).toBeInTheDocument();
  });

  it("marks the active filter on the combobox value", async () => {
    const user = userEvent.setup();
    render(<TestCasePanel cases={cases} />);
    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterCases }));
    await user.click(await screen.findByRole("option", { name: "محجوب" }));
    expect(screen.getByRole("combobox", { name: TESTING_LABELS.filterCases })).toHaveTextContent(
      "محجوب",
    );
  });

  it("filters as the search box is typed into", async () => {
    const user = userEvent.setup();
    render(<TestCasePanel cases={cases} />);

    await user.type(screen.getByLabelText(TESTING_LABELS.searchCases), "قفل");

    expect(screen.getByRole("button", { name: /قفل الحساب/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /دخول ناجح/ })).toBeNull();
  });

  it("says the suite is empty, not that a filter matched nothing", () => {
    render(<TestCasePanel cases={[]} />);
    expect(screen.getByText(TESTING_LABELS.noCases)).toBeInTheDocument();
  });

  it("says a filter matched nothing when the suite does have cases", async () => {
    const user = userEvent.setup();
    render(<TestCasePanel cases={[cases[0]]} />);

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterCases }));
    await user.click(await screen.findByRole("option", { name: "فشل" }));
    expect(screen.getByText(TESTING_LABELS.noCasesHint)).toBeInTheDocument();
  });

  it("shows the count of every case, not the filtered subset", async () => {
    const user = userEvent.setup();
    render(<TestCasePanel cases={cases} />);
    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterCases }));
    await user.click(await screen.findByRole("option", { name: "فشل" }));
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
