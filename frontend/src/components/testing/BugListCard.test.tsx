import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BugListCard, type BugCardBug } from "./BugListCard";
import { BUG_SEVERITY_LABELS, BUG_STATUS_LABELS, TESTING_LABELS } from "@/lib/constants";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const bug = (over: Partial<BugCardBug> = {}): BugCardBug => ({
  id: "bug-1",
  bugNumber: 114,
  title: "زر الحفظ لا يستجيب",
  severity: "MAJOR",
  status: "OPEN",
  createdAt: new Date().toISOString(),
  reportedBy: { id: "qa-1", firstName: "سارة", lastName: "أحمد" },
  system: { id: "system-1", name: "نظام الفواتير" },
  ...over,
});

describe("BugListCard — promotion", () => {
  it("offers «إنشاء تذكرة» on a bug with no ticket", () => {
    render(<BugListCard bug={bug()} canPromote />);
    expect(screen.getByRole("button", { name: TESTING_LABELS.promote })).toBeInTheDocument();
  });

  it("links to the ticket instead once the bug has one", () => {
    render(
      <BugListCard
        bug={bug({ ticketId: "ticket-1", ticket: { id: "ticket-1", ticketNumber: 142 } })}
        canPromote
      />,
    );
    expect(screen.queryByRole("button", { name: TESTING_LABELS.promote })).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/tickets/ticket-1");
    expect(screen.getByText("BRM-0142")).toBeInTheDocument();
  });

  it("hides the button from somebody who cannot promote", () => {
    render(<BugListCard bug={bug()} canPromote={false} />);
    expect(screen.queryByRole("button", { name: TESTING_LABELS.promote })).toBeNull();
  });

  it("hands the bug id to the parent", async () => {
    const onPromote = vi.fn();
    const user = userEvent.setup();
    render(<BugListCard bug={bug()} canPromote onPromote={onPromote} />);

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.promote }));
    expect(onPromote).toHaveBeenCalledWith("bug-1");
  });

  it("says what is happening while the ticket is being created", () => {
    render(<BugListCard bug={bug()} canPromote promoting />);
    const button = screen.getByRole("button", { name: TESTING_LABELS.promoting });
    expect(button).toBeDisabled();
  });
});

describe("BugListCard — chips", () => {
  it("shows severity and status as two separate chips", () => {
    render(<BugListCard bug={bug({ severity: "BLOCKER", status: "IN_PROGRESS" })} />);
    expect(screen.getByText(BUG_SEVERITY_LABELS.BLOCKER)).toBeInTheDocument();
    expect(screen.getByText(BUG_STATUS_LABELS.IN_PROGRESS)).toBeInTheDocument();
  });

  it("shows priority beside severity — impact and urgency are two questions", () => {
    render(<BugListCard bug={bug({ priority: "HIGH" })} />);
    expect(screen.getByText(BUG_SEVERITY_LABELS.MAJOR)).toBeInTheDocument();
    expect(screen.getByText("عالية")).toBeInTheDocument();
  });

  it("omits the priority chip when the bug has none", () => {
    render(<BugListCard bug={bug({ priority: null })} />);
    expect(screen.queryByText("عالية")).toBeNull();
  });

  it("shows the bug code LTR-isolated", () => {
    render(<BugListCard bug={bug()} />);
    expect(screen.getByText("BUG-0114")).toHaveAttribute("dir", "ltr");
  });

  it("gives each status its own spine colour on the start edge", () => {
    const spine = (status: string) => {
      const { container, unmount } = render(<BugListCard bug={bug({ status })} />);
      const el = container.querySelector("[data-status-spine]") as HTMLElement;
      const color = el.style.background;
      unmount();
      return color;
    };
    expect(spine("OPEN")).not.toBe(spine("FIXED"));
    expect(spine("FIXED")).not.toBe(spine("WONT_FIX"));
  });
});

describe("BugListCard — opening", () => {
  it("opens the editor from the title", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<BugListCard bug={bug()} onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: "زر الحفظ لا يستجيب" }));
    expect(onOpen).toHaveBeenCalledWith("bug-1");
  });
});
