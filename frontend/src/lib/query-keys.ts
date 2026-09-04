import type { QueryClient } from "@tanstack/react-query";

/**
 * Every cache key in one place, grouped by the rows it is derived from.
 *
 * The point is the *prefix*. React Query invalidates by array prefix, so
 * `invalidateQueries({ queryKey: qk.tickets.all })` reaches the tickets list,
 * the dashboard feed, a company's tickets and a user's tickets — including the
 * view somebody adds next month. Keys that only look related
 * (`["user-tickets"]` next to `["tickets"]`) are what let one write refresh a
 * single list and leave four others showing yesterday's data until the reader
 * reloads the page.
 *
 * Rule for new queries: never write a key literal at the call site — add it
 * here, under the family whose writes should refresh it.
 */

/** A ticket's own sub-resources sit under its detail key, so refreshing the
 *  ticket refreshes the whole page. Use `exact: true` for the detail alone. */
const ticketKeys = {
  /** Prefix for every cached ticket detail and sub-resource. */
  all: ["ticket"] as const,
  /** The detail row. As a prefix it also covers the sub-resources below. */
  detail: (id: string) => ["ticket", id] as const,
  timeline: (id: string) => ["ticket", id, "timeline"] as const,
  assignees: (id: string) => ["ticket", id, "assignees"] as const,
  dependencies: (id: string) => ["ticket", id, "dependencies"] as const,
  tasks: (id: string) => ["ticket", id, "tasks"] as const,
  /** Suites, cases and bugs for the «الاختبارات والأخطاء» section. */
  testing: (id: string) => ["ticket", id, "testing"] as const,
  /** People this ticket will accept a mention for. */
  mentionable: (id: string) => ["ticket", id, "mentionable"] as const,
};

export const qk = {
  /** Lists of tickets. Anything that changes a ticket row invalidates `all`. */
  tickets: {
    all: ["tickets"] as const,
    list: (filters: Record<string, string>) => ["tickets", "list", filters] as const,
    myCreated: () => ["tickets", "my-created"] as const,
    byCompany: (companyId: string) => ["tickets", "company", companyId] as const,
    byUser: (userId: string, asDeveloper: boolean) => ["tickets", "user", userId, asDeveloper] as const,
    /** A developer's own scope, used to derive their company filter chips. */
    devBase: () => ["tickets", "dev-base"] as const,
  },

  ticket: ticketKeys,

  /** Sub-resources to refresh when the ticket itself changes. */
  ticketSubResources: (id: string) => [
    ticketKeys.timeline(id),
    ticketKeys.assignees(id),
    ticketKeys.dependencies(id),
    ticketKeys.tasks(id),
    ticketKeys.testing(id),
  ],

  tasks: {
    /** Only the cross-ticket views; a ticket's own tasks live under `qk.ticket`. */
    all: ["tasks"] as const,
    mine: () => ["tasks", "my"] as const,
  },

  /** Test suites. A suite write invalidates `all`, which covers its cases. */
  suites: {
    all: ["suites"] as const,
    list: (filters: Record<string, string>) => ["suites", "list", filters] as const,
    detail: (id: string) => ["suites", "detail", id] as const,
  },

  /**
   * A case lives under its suite, so publishing or running one refreshes the
   * workspace and the rollup on the list card without naming either.
   */
  cases: {
    all: ["cases"] as const,
    bySuite: (suiteId: string) => ["suites", "detail", suiteId, "cases"] as const,
    detail: (id: string) => ["cases", "detail", id] as const,
    steps: (id: string) => ["cases", "detail", id, "steps"] as const,
  },

  bugs: {
    all: ["bugs"] as const,
    list: (filters: Record<string, string>) => ["bugs", "list", filters] as const,
    detail: (id: string) => ["bugs", "detail", id] as const,
    steps: (id: string) => ["bugs", "detail", id, "steps"] as const,
    openCount: () => ["bugs", "open-count"] as const,
  },

  /** Meetings. A meeting write invalidates `all`, which covers its minutes. */
  meetings: {
    all: ["meetings"] as const,
    list: (filters: Record<string, string>) => ["meetings", "list", filters] as const,
    detail: (id: string) => ["meetings", "detail", id] as const,
  },

  /**
   * The requirements backlog. Capture and promote both cross families, so the
   * hooks settle `meetings.all` / `tickets.all` alongside these.
   */
  requirements: {
    all: ["requirements"] as const,
    list: (filters: Record<string, string>) => ["requirements", "list", filters] as const,
    detail: (id: string) => ["requirements", "detail", id] as const,
    openCount: () => ["requirements", "open-count"] as const,
  },

  /**
   * The dev-hub tools catalogue. A decision moves a row between the catalogue
   * and the pending queue, so both read off this one prefix rather than two
   * keys that would leave the queue showing a tool already approved.
   */
  tools: {
    all: ["tools"] as const,
    list: (filters: Record<string, string>) => ["tools", "list", filters] as const,
    pendingCount: () => ["tools", "pending-count"] as const,
  },

  /**
   * Complaints and improvements on the hub. A status change moves a row
   * between the inbox badge and the list, so both read off this prefix.
   */
  feedback: {
    all: ["feedback"] as const,
    list: (filters: Record<string, string>) => ["feedback", "list", filters] as const,
    inboxCount: () => ["feedback", "inbox-count"] as const,
  },

  guides: {
    all: ["guides"] as const,
    list: () => ["guides", "list"] as const,
  },

  users: {
    all: ["users"] as const,
    list: () => ["users", "list"] as const,
    developers: (opts?: { pool?: "roster"; systemId?: string; companyId?: string }) =>
      opts
        ? (["users", "developers", opts] as const)
        : (["users", "developers"] as const),
    /** People the caller may @-mention. Pass ticketId or requirementId for scoped lists. */
    mentionable: (scope?: { ticketId?: string; requirementId?: string }) =>
      scope ? (["users", "mentionable", scope] as const) : (["users", "mentionable"] as const),
    detail: (id: string) => ["users", "detail", id] as const,
    comments: (id: string) => ["users", "comments", id] as const,
  },

  companies: {
    all: ["companies"] as const,
    list: () => ["companies", "list"] as const,
    detail: (id: string) => ["companies", "detail", id] as const,
  },

  systems: {
    all: ["systems"] as const,
    detail: (id: string) => ["systems", id] as const,
    /** `/systems?companyId=…`. Distinct from `detail` — a company is not a system. */
    byCompany: (companyId: string) => ["systems", "by-company", companyId] as const,
  },

  notifications: {
    all: ["notifications"] as const,
    page: (page: number, unreadOnly: boolean) => ["notifications", "page", page, unreadOnly] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
  },

  /** Rollups over every other family — see `DERIVED_KEYS` in `query-client.ts`. */
  reports: {
    all: ["reports"] as const,
    dashboard: (companyId?: string) => ["reports", "dashboard", companyId ?? null] as const,
    developers: () => ["reports", "developers"] as const,
    overdue: () => ["reports", "overdue"] as const,
    trend: (months: number) => ["reports", "trend", months] as const,
  },

  invitations: { all: ["invitations"] as const },
  signupRequests: { all: ["signup-requests"] as const },
} as const;

/**
 * Companies, departments and systems are one tree read through four different
 * queries: the admin list, a company page, a system row, and the company filter
 * chips on the tickets and users pages. Renaming a system has to move all four,
 * so every structure write settles through here instead of naming two of them
 * and leaving the other two showing the old name until a reload.
 */
export function invalidateStructure(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: qk.companies.all });
  qc.invalidateQueries({ queryKey: qk.systems.all });
}
