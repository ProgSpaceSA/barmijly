import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderedStepList } from "./OrderedStepList";
import type { TestStep } from "./StepRow";
import { TESTING_LABELS } from "@/lib/constants";

// The authorised-download fetch has no place in a step-list test.
vi.mock("@/components/shared/AttachmentImage", () => ({
  AttachmentImage: ({ alt, className }: { alt: string; className?: string }) => (
    <img alt={alt} className={className} />
  ),
}));

const steps: TestStep[] = [
  { id: "s1", order: 0, body: "افتح صفحة الدخول" },
  { id: "s2", order: 1, body: "أدخل بيانات صحيحة" },
  { id: "s3", order: 2, body: "اضغط دخول" },
];

const withShot: TestStep[] = [
  {
    id: "s1",
    order: 0,
    body: "افتح صفحة الدخول",
    attachments: [{ id: "a1", url: "/uploads/shot.png", fileName: "shot.png" }],
  },
];

beforeEach(() => vi.clearAllMocks());

describe("OrderedStepList — numbering", () => {
  it("numbers by position, so the screen matches «الخطوة ٢» whatever `order` holds", () => {
    render(<OrderedStepList steps={[{ id: "s1", order: 7, body: "خطوة" }]} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders steps in `order`, not the order they arrived in", () => {
    render(
      <OrderedStepList
        steps={[
          { id: "s3", order: 2, body: "ثالثة" },
          { id: "s1", order: 0, body: "أولى" },
          { id: "s2", order: 1, body: "ثانية" },
        ]}
      />,
    );
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(["أولى", "ثانية", "ثالثة"]);
  });

  it("says the list is empty rather than showing nothing at all", () => {
    render(<OrderedStepList steps={[]} />);
    expect(screen.getByText(TESTING_LABELS.noSteps)).toBeInTheDocument();
  });
});

describe("OrderedStepList — editing", () => {
  it("adds a step from the dashed row", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<OrderedStepList steps={steps} onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.addStep }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("deletes the step whose × was clicked", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<OrderedStepList steps={steps} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: `${TESTING_LABELS.deleteStep} 2` }));
    expect(onDelete).toHaveBeenCalledWith("s2");
  });

  it("debounces an edited step rather than saving on every keystroke", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onBodyChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<OrderedStepList steps={steps} onBodyChange={onBodyChange} />);

    const input = screen.getByDisplayValue("اضغط دخول");
    await user.clear(input);
    await user.type(input, "اضغط تسجيل");
    expect(onBodyChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(650);
    expect(onBodyChange).toHaveBeenCalledExactlyOnceWith("s3", "اضغط تسجيل");
    vi.useRealTimers();
  });

  it("keeps a trailing space when the debounced step save fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onBodyChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<OrderedStepList steps={steps} onBodyChange={onBodyChange} />);

    const input = screen.getByDisplayValue("اضغط دخول");
    await user.clear(input);
    await user.type(input, "this is testing ");
    await vi.advanceTimersByTimeAsync(650);

    expect(onBodyChange).toHaveBeenCalledExactlyOnceWith("s3", "this is testing ");
    expect(input).toHaveValue("this is testing ");
    vi.useRealTimers();
  });

  it("saves a cleared step body so blanking is intentional", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onBodyChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<OrderedStepList steps={steps} onBodyChange={onBodyChange} />);

    const input = screen.getByDisplayValue("اضغط دخول");
    await user.clear(input);
    await vi.advanceTimersByTimeAsync(650);

    expect(onBodyChange).toHaveBeenCalledWith("s3", "");
    expect(screen.getByLabelText(`${TESTING_LABELS.steps} 3`)).toHaveValue("");
    vi.useRealTimers();
  });

  it("disables delete once the list is down to the minimum", () => {
    render(<OrderedStepList steps={[steps[0]]} minSteps={1} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: `${TESTING_LABELS.deleteStep} 1` })).toBeDisabled();
  });

  it("leaves delete enabled while a draft still has room to lose one", () => {
    render(<OrderedStepList steps={[steps[0]]} minSteps={0} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: `${TESTING_LABELS.deleteStep} 1` })).toBeEnabled();
  });
});

describe("OrderedStepList — screenshots", () => {
  it("offers a one-line drop slot on a step with no screenshot", () => {
    render(<OrderedStepList steps={steps} onAttach={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: TESTING_LABELS.addScreenshot })).toHaveLength(3);
  });

  it("accepts images only", () => {
    render(<OrderedStepList steps={steps} onAttach={vi.fn()} />);
    const input = screen.getAllByLabelText(TESTING_LABELS.addScreenshot).find(
      (el) => el.tagName === "INPUT",
    ) as HTMLInputElement;
    expect(input.accept).toContain("image/*");
    expect(input.accept).not.toContain(".pdf");
  });

  it("uploads the picked file for that step", async () => {
    const onAttach = vi.fn();
    const user = userEvent.setup();
    render(<OrderedStepList steps={[steps[0]]} onAttach={onAttach} />);

    const input = screen.getAllByLabelText(TESTING_LABELS.addScreenshot).find(
      (el) => el.tagName === "INPUT",
    ) as HTMLInputElement;
    const file = new File(["x"], "shot.png", { type: "image/png" });
    await user.upload(input, file);

    expect(onAttach).toHaveBeenCalledWith("s1", file);
  });

  it("swaps the slot for a thumbnail once attached", () => {
    render(<OrderedStepList steps={withShot} onAttach={vi.fn()} onDetach={vi.fn()} />);
    expect(screen.queryByRole("button", { name: TESTING_LABELS.addScreenshot })).toBeNull();
    expect(screen.getByRole("img", { name: "shot.png" })).toBeInTheDocument();
  });

  it("shows the thumbnail without a separate remove-icon control", () => {
    render(<OrderedStepList steps={withShot} onDetach={vi.fn()} />);
    expect(screen.queryByRole("button", { name: TESTING_LABELS.removeScreenshot })).toBeNull();
    expect(screen.getByRole("button", { name: "shot.png" })).toBeInTheDocument();
  });

  it("opens the thumbnail through the authorised route, by id", async () => {
    const onOpenImage = vi.fn();
    const user = userEvent.setup();
    render(<OrderedStepList steps={withShot} onOpenImage={onOpenImage} />);

    await user.click(screen.getByRole("button", { name: "shot.png" }));
    expect(onOpenImage).toHaveBeenCalledWith("a1");
  });
});

describe("OrderedStepList — read-only", () => {
  it("hides the grip, the delete and the add row", () => {
    render(<OrderedStepList steps={steps} readOnly onAdd={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: TESTING_LABELS.dragStep })).toBeNull();
    expect(screen.queryByRole("button", { name: `${TESTING_LABELS.deleteStep} 1` })).toBeNull();
    expect(screen.queryByRole("button", { name: TESTING_LABELS.addStep })).toBeNull();
  });

  it("renders the body as text rather than an input", () => {
    render(<OrderedStepList steps={steps} readOnly />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("افتح صفحة الدخول")).toBeInTheDocument();
  });

  it("keeps a screenshot visible but not removable", () => {
    render(<OrderedStepList steps={withShot} readOnly onDetach={vi.fn()} />);
    expect(screen.getByRole("img", { name: "shot.png" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: TESTING_LABELS.removeScreenshot })).toBeNull();
  });

  it("offers no way to add a screenshot", () => {
    render(<OrderedStepList steps={steps} readOnly />);
    expect(screen.queryByRole("button", { name: TESTING_LABELS.addScreenshot })).toBeNull();
  });
});

describe("OrderedStepList — reordering", () => {
  it("exposes a grip per step for pointer and keyboard reordering", () => {
    render(<OrderedStepList steps={steps} onReorder={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: TESTING_LABELS.dragStep })).toHaveLength(3);
  });

  it("makes every grip keyboard-reachable — drag-only reordering strands anyone without a mouse", () => {
    render(<OrderedStepList steps={steps} onReorder={vi.fn()} />);
    for (const grip of screen.getAllByRole("button", { name: TESTING_LABELS.dragStep })) {
      expect(grip).toHaveAttribute("aria-roledescription", "sortable");
      expect(grip).toHaveAttribute("tabindex", "0");
    }
  });

  it("keeps the grip out of the tab order when the list is read-only", () => {
    render(<OrderedStepList steps={steps} readOnly />);
    expect(screen.queryByRole("button", { name: TESTING_LABELS.dragStep })).toBeNull();
  });
});
