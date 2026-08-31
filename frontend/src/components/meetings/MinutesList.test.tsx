import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MinutesList } from "./MinutesList";
import { MEETING_LABELS, POINT_KIND_LABELS } from "@/lib/constants";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const points = [
  { id: "p1", order: 0, kind: "REQUEST", body: "بند أول", requirements: [] },
  {
    id: "p2",
    order: 1,
    kind: "NOTE",
    body: "بند ثانٍ",
    requirements: [{ id: "req-1", requirementNumber: 4, title: "متطلب", status: "NEW" }],
  },
];

describe("MinutesList", () => {
  it("numbers the lines in their stored order", () => {
    // Out of order on the way in — the component sorts, the API renumbers.
    render(<MinutesList points={[points[1], points[0]]} onAdd={vi.fn()} />);

    expect(screen.getByLabelText(`${MEETING_LABELS.pointLine} 1`)).toHaveValue("بند أول");
    expect(screen.getByLabelText(`${MEETING_LABELS.pointLine} 2`)).toHaveValue("بند ثانٍ");
  });

  it("debounces an edit into one write", async () => {
    const user = userEvent.setup();
    const onBodyChange = vi.fn();
    render(<MinutesList points={points} onBodyChange={onBodyChange} />);

    const input = screen.getByLabelText(`${MEETING_LABELS.pointLine} 1`);
    await user.type(input, "!");

    await waitFor(() => expect(onBodyChange).toHaveBeenCalledWith("p1", "بند أول!"));
    expect(onBodyChange).toHaveBeenCalledTimes(1);
  });

  it("grows the line when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onBodyChange = vi.fn();
    render(<MinutesList points={points} onBodyChange={onBodyChange} />);

    const input = screen.getByLabelText(`${MEETING_LABELS.pointLine} 1`);
    await user.type(input, "!");
    await user.keyboard("{Enter}second line");

    expect(input).toHaveValue("بند أول!\nsecond line");
  });

  it("drops an edit that empties the line rather than storing a blank", async () => {
    const user = userEvent.setup();
    const onBodyChange = vi.fn();
    render(<MinutesList points={points} onBodyChange={onBodyChange} />);

    const input = screen.getByLabelText(`${MEETING_LABELS.pointLine} 1`);
    await user.clear(input);
    await user.tab();

    await waitFor(() => expect(onBodyChange).not.toHaveBeenCalled());
  });

  it("links the requirement captured from a line", () => {
    render(<MinutesList points={points} />);

    expect(screen.getByText("REQ-0004").closest("a")).toHaveAttribute(
      "href",
      "/requirements/req-1",
    );
  });

  it("offers capture only when the caller may create requirements", () => {
    const { rerender } = render(<MinutesList points={points} />);
    expect(screen.queryByLabelText(`${MEETING_LABELS.capture} 1`)).toBeNull();

    rerender(<MinutesList points={points} canCapture onCapture={vi.fn()} />);
    expect(screen.getByLabelText(`${MEETING_LABELS.capture} 1`)).toBeInTheDocument();
  });

  it("hands the whole point to the capture callback", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn();
    render(<MinutesList points={points} canCapture onCapture={onCapture} />);

    await user.click(screen.getByLabelText(`${MEETING_LABELS.capture} 1`));
    expect(onCapture).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  it("renders read-only lines as text with their kind", () => {
    render(<MinutesList points={points} readOnly />);

    expect(screen.queryByLabelText(`${MEETING_LABELS.pointLine} 1`)).toBeNull();
    expect(screen.getByText("بند أول")).toBeInTheDocument();
    expect(screen.getByText(POINT_KIND_LABELS.REQUEST)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.addPoint })).toBeNull();
  });

  it("will not capture a line nobody has written yet", () => {
    const blank = [{ id: "p3", order: 0, kind: "NOTE", body: "   ", requirements: [] }];
    render(<MinutesList points={blank} canCapture onCapture={vi.fn()} />);

    expect(screen.getByLabelText(`${MEETING_LABELS.capture} 1`)).toBeDisabled();
  });

  /**
   * The line is one row only at `xl`. Below it the text keeps a row of its own
   * and the kind, capture and delete controls sit under it — a phone has no
   * room for four controls abreast, and neither has the `lg` two-column page.
   */
  it("stacks the editable line until the column is wide", () => {
    render(<MinutesList points={points} canCapture onCapture={vi.fn()} />);

    const text = screen.getByLabelText(`${MEETING_LABELS.pointLine} 1`);
    const row = text.parentElement as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    expect(row.className).toContain("xl:flex-nowrap");

    // The text claims the whole row; the kind select shares the one below it.
    expect(text.className).toContain("basis-full");
    const kind = screen.getByLabelText(`${MEETING_LABELS.pointKind} 1`);
    expect(kind.className).toContain("flex-1");
    expect(kind.className).toContain("xl:w-32");
  });

  it("shows the empty state with no lines", () => {
    render(<MinutesList points={[]} />);
    expect(screen.getByText(MEETING_LABELS.noPoints)).toBeInTheDocument();
  });
});
