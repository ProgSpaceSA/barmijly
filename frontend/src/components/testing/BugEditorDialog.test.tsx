import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BugEditorDialog } from "./BugEditorDialog";
import { SELECT_PLACEHOLDERS, TESTING_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const company = { id: "11111111-1111-4111-8111-111111111111", name: "شركة أ" };
const system = { id: "22222222-2222-4222-8222-222222222222", name: "نظام أ" };

const caseContext = {
  caseId: "case-1",
  caseNumber: 114,
  caseTitle: "تسجيل الدخول",
  suiteTitle: "مجموعة الدخول",
};

function renderDialog(props: Partial<Parameters<typeof BugEditorDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BugEditorDialog onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) => {
    if (url === "/companies") return Promise.resolve({ data: [company] });
    if (url.startsWith("/systems")) return Promise.resolve({ data: [system] });
    return Promise.resolve({ data: [] });
  });
  mockPost.mockImplementation((url: string) => {
    if (String(url).includes("/promote")) {
      return Promise.resolve({ data: { bug: { id: "bug-new" }, ticket: { id: "ticket-new" } } });
    }
    return Promise.resolve({
      data: { id: "bug-new", bugNumber: 12, title: "زر الحفظ لا يستجيب" },
    });
  });
  mockPatch.mockResolvedValue({ data: { id: "bug-1" } });
});

/** Fills the two fields the dialog will not save without. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(TESTING_LABELS.bugTitle), "زر الحفظ لا يستجيب");
  await user.type(screen.getByLabelText(TESTING_LABELS.bugDescription), "لا شيء يحدث");
}

describe("BugEditorDialog — opened from a case", () => {
  it("names the suite and case in a context strip", () => {
    renderDialog({ caseContext });
    expect(screen.getByText(/تسجيل الدخول/)).toHaveTextContent("مجموعة الدخول");
    expect(screen.getByText("TC-0114")).toBeInTheDocument();
  });

  it("hides the company and system pickers — the case answers both", () => {
    renderDialog({ caseContext });
    expect(screen.queryByLabelText(SELECT_PLACEHOLDERS.company)).toBeNull();
    expect(screen.queryByLabelText(SELECT_PLACEHOLDERS.system)).toBeNull();
  });

  it("files against the case rather than a system", async () => {
    const user = userEvent.setup();
    renderDialog({ caseContext });
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.save }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/bugs",
        expect.objectContaining({ testCaseId: "case-1" }),
      ),
    );
    expect(mockPost.mock.calls[0][1]).not.toHaveProperty("systemId");
  });

  it("turns the bug standalone when the strip is removed", async () => {
    const user = userEvent.setup();
    renderDialog({ caseContext });

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.clearCaseContext }));

    expect(screen.queryByText("TC-0114")).toBeNull();
    expect(await screen.findByLabelText(SELECT_PLACEHOLDERS.company)).toBeInTheDocument();
  });
});

describe("BugEditorDialog — standalone", () => {
  it("asks for a company and a system instead of a case", async () => {
    renderDialog();
    expect(await screen.findByLabelText(SELECT_PLACEHOLDERS.company)).toBeInTheDocument();
    expect(screen.getByLabelText(SELECT_PLACEHOLDERS.system)).toBeInTheDocument();
    expect(document.querySelector("select")).toBeNull();
  });

  it("keeps the system picker disabled until a company is picked", async () => {
    renderDialog();
    expect(await screen.findByLabelText(SELECT_PLACEHOLDERS.system)).toBeDisabled();
  });

  it("will not save without a system, however complete the text is", async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillRequired(user);

    expect(screen.getByRole("button", { name: TESTING_LABELS.save })).toBeDisabled();
  });

  it("saves once a system is chosen", async () => {
    const user = userEvent.setup();
    renderDialog({ defaultCompanyId: company.id, defaultSystemId: system.id });
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.save }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/bugs",
        expect.objectContaining({ systemId: system.id, companyId: company.id }),
      ),
    );
  });
});

describe("BugEditorDialog — saving", () => {
  it("offers all three save actions", () => {
    renderDialog({ caseContext });
    for (const label of [
      TESTING_LABELS.saveDraft,
      TESTING_LABELS.save,
      TESTING_LABELS.saveAndPromote,
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("disables every save until the required fields are filled", () => {
    renderDialog({ caseContext });
    for (const label of [
      TESTING_LABELS.saveDraft,
      TESTING_LABELS.save,
      TESTING_LABELS.saveAndPromote,
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });

  it("«حفظ وإنشاء تذكرة» saves first, then asks for the ticket title", async () => {
    const user = userEvent.setup();
    renderDialog({ caseContext });
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.saveAndPromote }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/bugs", expect.any(Object)));
    expect(mockPost.mock.calls.some((c) => String(c[0]).includes("/promote"))).toBe(false);

    const titleField = await screen.findByLabelText(TESTING_LABELS.promoteTitleLabel);
    expect((titleField as HTMLInputElement).value).toContain("زر الحفظ لا يستجيب");

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.promoteConfirm }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/bugs/bug-new/promote",
        expect.objectContaining({ title: expect.stringContaining("زر الحفظ لا يستجيب") }),
      ),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/tickets/ticket-new"));
  });

  it("hides «حفظ وإنشاء تذكرة» once the bug already has a ticket", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/bugs/bug-1") {
        return Promise.resolve({
          data: {
            id: "bug-1",
            title: "خطأ",
            description: "وصف",
            severity: "MAJOR",
            ticketId: "ticket-1",
          },
        });
      }
      if (url === "/bugs/bug-1/steps") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    renderDialog({ bugId: "bug-1" });
    await screen.findByDisplayValue("خطأ");

    expect(screen.queryByRole("button", { name: TESTING_LABELS.saveAndPromote })).toBeNull();
  });

  it("«حفظ ومتابعة» keeps the dialog open so the bug can still be edited", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog({ caseContext, onClose });
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.saveDraft }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("«حفظ» closes the dialog", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog({ caseContext, onClose });
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.save }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("BugEditorDialog — repro steps", () => {
  it("lets a new bug take repro steps before the first save", () => {
    renderDialog({ caseContext });
    expect(screen.queryByText(TESTING_LABELS.stepsAfterSave)).toBeNull();
    expect(screen.getByRole("button", { name: TESTING_LABELS.addStep })).toBeInTheDocument();
  });

  it("posts draft steps after the bug is created", async () => {
    const user = userEvent.setup();
    renderDialog({ caseContext });

    await user.type(screen.getByLabelText(TESTING_LABELS.bugTitle), "زر الحفظ لا يستجيب");
    await user.type(screen.getByLabelText(TESTING_LABELS.bugDescription), "لا شيء يحدث");
    await user.type(screen.getByPlaceholderText(TESTING_LABELS.stepPlaceholder), "افتح الصفحة");

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.save }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/bugs", expect.any(Object)));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/bugs/bug-new/steps", { body: "افتح الصفحة" }),
    );
  });

  it("uses the ordered step list, not a textarea, once the bug exists", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/bugs/bug-1") {
        return Promise.resolve({
          data: { id: "bug-1", title: "خطأ", description: "وصف", severity: "MAJOR" },
        });
      }
      if (url === "/bugs/bug-1/steps") {
        return Promise.resolve({ data: [{ id: "s1", order: 0, body: "افتح الصفحة" }] });
      }
      return Promise.resolve({ data: [] });
    });

    renderDialog({ bugId: "bug-1" });

    expect(await screen.findByDisplayValue("افتح الصفحة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TESTING_LABELS.addStep })).toBeInTheDocument();
  });
});

describe("BugEditorDialog — chrome", () => {
  it("is a labelled modal", () => {
    renderDialog({ caseContext });
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("closes from the × button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog({ caseContext, onClose });

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.close }));
    expect(onClose).toHaveBeenCalled();
  });
});
