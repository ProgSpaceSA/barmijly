import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RequirementDescriptionHistoryList,
  RequirementStatusHistoryList,
} from "./RequirementHistoryList";
import { MEETING_LABELS, REQUIREMENT_STATUS_LABELS } from "@/lib/constants";

describe("RequirementHistoryList", () => {
  it("renders status history newest first", () => {
    render(
      <RequirementStatusHistoryList
        rows={[
          {
            id: "old",
            toStatus: "NEW",
            createdAt: "2026-08-28T11:00:00.000Z",
            changedBy: { firstName: "أ", lastName: "ب" },
            note: "أولاً",
          },
          {
            id: "new",
            toStatus: "CONVERTED",
            createdAt: "2026-08-28T14:00:00.000Z",
            changedBy: { firstName: "أ", lastName: "ب" },
            note: "ثانياً",
          },
        ]}
        empty="فارغ"
      />,
    );

    const notes = screen.getAllByText(/^(أولاً|ثانياً)$/);
    expect(notes[0]).toHaveTextContent("ثانياً");
    expect(notes[1]).toHaveTextContent("أولاً");
    expect(screen.getAllByText(REQUIREMENT_STATUS_LABELS.CONVERTED).length).toBeGreaterThan(0);
  });

  it("uses the same row layout for description history", () => {
    render(
      <RequirementDescriptionHistoryList
        rows={[
          {
            id: "d1",
            createdAt: "2026-08-28T14:00:00.000Z",
            changedBy: { firstName: "سارة", lastName: "أحمد" },
            toDescription: "وصف محدّث",
          },
        ]}
        empty="فارغ"
      />,
    );

    expect(screen.getAllByText(MEETING_LABELS.descriptionChanged).length).toBeGreaterThan(0);
    expect(screen.getByText("سارة أحمد")).toBeInTheDocument();
    expect(screen.getByText("وصف محدّث")).toBeInTheDocument();
  });

  it("offers show more for long description history text", () => {
    const long = "سطر أول من الوصف\n".repeat(6);
    render(
      <RequirementDescriptionHistoryList
        rows={[
          {
            id: "d2",
            createdAt: "2026-08-28T15:00:00.000Z",
            changedBy: { firstName: "أ", lastName: "ب" },
            toDescription: long,
          },
        ]}
        empty="فارغ"
      />,
    );

    expect(screen.getByRole("button", { name: MEETING_LABELS.showMore })).toBeInTheDocument();
  });

  it("does not lock a short history into an inner scroller", () => {
    const { container } = render(
      <RequirementStatusHistoryList
        rows={[
          {
            id: "new",
            toStatus: "CONVERTED",
            createdAt: "2026-08-28T14:00:00.000Z",
            changedBy: { firstName: "أ", lastName: "ب" },
            note: "ثانياً",
          },
          {
            id: "old",
            toStatus: "NEW",
            createdAt: "2026-08-28T11:00:00.000Z",
            changedBy: { firstName: "أ", lastName: "ب" },
            note: "أولاً",
          },
        ]}
        empty="فارغ"
      />,
    );

    expect(container.querySelector(".overflow-y-auto")).toBeNull();
  });
});
