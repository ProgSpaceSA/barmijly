import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DraftReproSteps, newDraftStep } from "./DraftReproSteps";
import type { TestStep } from "./StepRow";
import { TESTING_LABELS } from "@/lib/constants";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Harness() {
  const [steps, setSteps] = useState<TestStep[]>([newDraftStep(0)]);
  return <DraftReproSteps steps={steps} onChange={setSteps} />;
}

describe("DraftReproSteps — screenshots", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows a local thumbnail after picking an image", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen
      .getAllByLabelText(TESTING_LABELS.addScreenshot)
      .find((el) => el instanceof HTMLInputElement) as HTMLInputElement;
    const file = new File(["img"], "shot.png", { type: "image/png" });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "shot.png" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: TESTING_LABELS.removeScreenshot })).toBeNull();
  });
});
