import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();

let currentRole: string | undefined = "PROGRAMMING_HEAD";
let currentToken: string | null = "jwt";

vi.mock("@/store/auth", () => ({
  useAuthStore: (selector?: (s: any) => any) => {
    const state = { token: currentToken, user: currentRole ? { id: "me", role: currentRole } : null };
    return selector ? selector(state) : state;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/tickets",
}));

// Forwards the drawer props so the shell's open/close wiring is observable.
vi.mock("./Sidebar", () => ({
  Sidebar: ({ open, onNavigate }: { open?: boolean; onNavigate?: () => void }) => (
    <nav data-testid="sidebar" data-open={open ? "true" : "false"}>
      <button onClick={onNavigate}>رابط</button>
    </nav>
  ),
}));
vi.mock("@/components/shared/CommandPalette", () => ({ CommandPalette: () => null }));

import { AppShell, resetAppShellHydrated } from "./AppShell";

beforeEach(() => {
  currentRole = "PROGRAMMING_HEAD";
  currentToken = "jwt";
  resetAppShellHydrated();
  replace.mockClear();
});

describe("AppShell route guard", () => {
  it("renders the page for a role that holds the action", async () => {
    render(
      <AppShell requires="user:read">
        <p>قائمة المستخدمين</p>
      </AppShell>,
    );

    expect(await screen.findByText("قائمة المستخدمين")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a role without the action back to the dashboard", async () => {
    currentRole = "DEVELOPER";

    render(
      <AppShell requires="user:read">
        <p>قائمة المستخدمين</p>
      </AppShell>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText("قائمة المستخدمين")).not.toBeInTheDocument();
  });

  // The reported regression: a project manager reached المستخدمون and could
  // invite people. req.md §2 keeps that role on tickets, not on accounts.
  it("keeps a project manager out of the users page", async () => {
    currentRole = "PROJECT_MANAGER";

    render(
      <AppShell requires="user:read">
        <p>قائمة المستخدمين</p>
      </AppShell>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText("قائمة المستخدمين")).not.toBeInTheDocument();
  });

  it.each(["invitation:manage", "signup:review", "structure:manage"] as const)(
    "keeps a project manager out of %s pages too",
    async (action) => {
      currentRole = "PROJECT_MANAGER";

      render(
        <AppShell requires={action}>
          <p>صفحة الإدارة</p>
        </AppShell>,
      );

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
      expect(screen.queryByText("صفحة الإدارة")).not.toBeInTheDocument();
    },
  );

  it("still lets a project manager open the pages their role covers", async () => {
    currentRole = "PROJECT_MANAGER";

    render(
      <AppShell requires="ticket:read-archived">
        <p>الأرشيف</p>
      </AppShell>,
    );

    expect(await screen.findByText("الأرشيف")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("guards the signup review page the same way", async () => {
    currentRole = "QA";

    render(
      <AppShell requires="signup:review">
        <p>طلبات التسجيل</p>
      </AppShell>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText("طلبات التسجيل")).not.toBeInTheDocument();
  });

  it("renders an ungated page for every signed-in role", async () => {
    currentRole = "TICKET_REQUESTER";

    render(
      <AppShell>
        <p>لوحة التحكم</p>
      </AppShell>,
    );

    expect(await screen.findByText("لوحة التحكم")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("skips the full-page spinner on the next AppShell mount", async () => {
    const first = render(
      <AppShell>
        <p>لوحة التحكم</p>
      </AppShell>,
    );
    expect(await screen.findByText("لوحة التحكم")).toBeInTheDocument();
    first.unmount();

    render(
      <AppShell>
        <p>التذاكر</p>
      </AppShell>,
    );
    expect(screen.getByText("التذاكر")).toBeInTheDocument();
    expect(screen.queryByText("loading...")).not.toBeInTheDocument();
  });

  it("still sends a signed-out visitor to the login page", async () => {
    currentToken = null;

    render(
      <AppShell requires="user:read">
        <p>قائمة المستخدمين</p>
      </AppShell>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});

// Below `lg` the rail is an off-canvas drawer. Which side of the breakpoint we
// are on is a media query and invisible to jsdom; what is testable here is the
// wiring — the bar exists, it opens the drawer, and every route out of it
// closes the drawer again.
describe("AppShell mobile drawer", () => {
  it("starts closed and opens from the bar", async () => {
    const user = userEvent.setup();
    render(<AppShell><p>لوحة التحكم</p></AppShell>);

    const toggle = await screen.findByRole("button", { name: "فتح القائمة" });
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-open", "false");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-open", "true");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on the backdrop, on Escape, and on following a link", async () => {
    const user = userEvent.setup();
    render(<AppShell><p>لوحة التحكم</p></AppShell>);

    const toggle = await screen.findByRole("button", { name: "فتح القائمة" });
    const sidebar = () => screen.getByTestId("sidebar");
    const backdrop = () => document.querySelector(".brm-sidebar-backdrop");

    await user.click(toggle);
    expect(backdrop()).toBeTruthy();
    await user.click(backdrop() as Element);
    expect(sidebar()).toHaveAttribute("data-open", "false");
    expect(backdrop()).toBeNull();

    await user.click(toggle);
    await user.keyboard("{Escape}");
    expect(sidebar()).toHaveAttribute("data-open", "false");

    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "رابط" }));
    expect(sidebar()).toHaveAttribute("data-open", "false");
  });

  // The drawer covers the page; the page behind it must not scroll under the
  // finger, and the lock has to lift again when it closes.
  it("locks and restores page scrolling around the drawer", async () => {
    const user = userEvent.setup();
    render(<AppShell><p>لوحة التحكم</p></AppShell>);

    const toggle = await screen.findByRole("button", { name: "فتح القائمة" });
    expect(document.body.style.overflow).toBe("");

    await user.click(toggle);
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });
});
