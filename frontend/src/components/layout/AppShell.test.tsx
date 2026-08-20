import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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
}));

vi.mock("./Sidebar", () => ({ Sidebar: () => <nav data-testid="sidebar" /> }));
vi.mock("@/components/shared/CommandPalette", () => ({ CommandPalette: () => null }));

import { AppShell } from "./AppShell";

beforeEach(() => {
  currentRole = "PROGRAMMING_HEAD";
  currentToken = "jwt";
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
