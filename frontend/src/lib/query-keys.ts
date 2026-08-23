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
  ],

  tasks: {
    /** Only the cross-ticket views; a ticket's own tasks live under `qk.ticket`. */
    all: ["tasks"] as const,
    mine: () => ["tasks", "my"] as const,
  },

  users: {
    all: ["users"] as const,
    list: () => ["users", "list"] as const,
    developers: (pool?: "roster") =>
      (pool ? (["users", "developers", pool] as const) : (["users", "developers"] as const)),
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
