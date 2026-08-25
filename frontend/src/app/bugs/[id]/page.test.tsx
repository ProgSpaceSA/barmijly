import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TESTING_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();
const mockPush = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: vi.fn(),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuthStore: (selector?: (s: { user: { id: string; role: string } }) => unknown) => {
    const state = { user: { id: "qa-1", role: "QA" } };
    return selector ? selector(state) : state;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import BugDetailPage from "./page";

const bug = {
  id: "bug-1",
  bugNumber: 9,
  title: "زر الحفظ لا يستجيب",
  description: "الضغط لا يفعل شيئاً",
  expectedBehavior: "يحفظ",
  actualBehavior: "لا شيء",
  environment: "Chrome",
  severity: "MAJOR",
  status: "OPEN",
  priority: null,
  ticketId: null,
  testCaseId: null,
  suiteId: "suite-1",
  isArchived: false,
  steps: [{ id: "s1", order: 0, body: "افتح الشاشة" }],
};

const params = Object.assign(Promise.resolve({ id: "bug-1" }), {
  status: "fulfilled",
  value: { id: "bug-1" },
}) as Promise<{ id: string }>;

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <BugDetailPage params={params} />
      </Suspense>
    </QueryClientProvider>,
  );
  await act(async () => {});
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) => {
    if (url === "/bugs/bug-1") return Promise.resolve({ data: bug });
    if (url === "/bugs/bug-1/steps") return Promise.resolve({ data: bug.steps });
    if (url === "/test-suites/suite-1/cases") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
  mockPatch.mockResolvedValue({ data: bug });
  mockPost.mockResolvedValue({ data: {} });
});

describe("/bugs/[id] — view first", () => {
  it("shows the title as a heading, not an editable field", async () => {
    await renderPage();
    expect(await screen.findByRole("heading", { name: bug.title })).toBeInTheDocument();
    expect(screen.queryByLabelText(TESTING_LABELS.bugTitle)).toBeNull();
  });

  it("renders description as read-only text", async () => {
    await renderPage();
    expect(await screen.findByText(bug.description)).toBeInTheDocument();
    expect(screen.queryByLabelText(TESTING_LABELS.bugDescription)).toBeNull();
  });

  it("offers تعديل to enter edit mode", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: TESTING_LABELS.edit }));
    expect(screen.getByLabelText(TESTING_LABELS.bugTitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TESTING_LABELS.save })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TESTING_LABELS.cancel })).toBeInTheDocument();
  });

  it("offers ربط بحالة when the bug has a suite but no case", async () => {
    await renderPage();
    expect(await screen.findByRole("button", { name: TESTING_LABELS.linkToCase })).toBeInTheDocument();
  });

  it("links a linked case chip into the suite workspace", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/bugs/bug-1") {
        return Promise.resolve({
          data: {
            ...bug,
            testCaseId: "case-1",
            testCase: { id: "case-1", title: "دخول", caseNumber: 3 },
            suite: { id: "suite-1", title: "مجموعة" },
          },
        });
      }
      if (url === "/bugs/bug-1/steps") return Promise.resolve({ data: bug.steps });
      return Promise.resolve({ data: [] });
    });
    await renderPage();
    expect(await screen.findByRole("link", { name: /دخول/ })).toHaveAttribute(
      "href",
      "/test-suites/suite-1?caseId=case-1",
    );
  });
});
