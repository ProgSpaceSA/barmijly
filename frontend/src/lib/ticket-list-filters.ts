import type { UserRole } from "@/store/auth";
import { TICKET_ACTION_INBOX_LABEL } from "@/lib/constants";

/**
 * Mirror of `backend/src/tickets/action-queues.ts`.
 *
 * The digest, the dashboard hub, and this list page all use the same buckets
 * so a ticket that needs the caller this morning is the one the list opens on.
 */
export const ROLE_TICKET_ACTION_BUCKETS: Record<UserRole, readonly { label: string; statuses: readonly string[] }[]> = {
  PROGRAMMING_HEAD: [
    { label: "بانتظار اعتمادك", statuses: ["NEW", "AWAITING_APPROVAL"] },
    { label: "معتمدة بانتظار الإسناد", statuses: ["APPROVED"] },
    { label: "بانتظار الاختبار", statuses: ["AWAITING_TESTING"] },
    { label: "بانتظار اعتماد الإغلاق", statuses: ["AWAITING_OWNER_APPROVAL"] },
    { label: "متوقفة بانتظار رفع العائق", statuses: ["BLOCKED"] },
    { label: "معلقة", statuses: ["ON_HOLD"] },
  ],
  PROJECT_MANAGER: [
    { label: "معتمدة بانتظار الإسناد", statuses: ["APPROVED"] },
    { label: "بانتظار الاختبار", statuses: ["AWAITING_TESTING"] },
    { label: "بانتظار اعتماد الإغلاق", statuses: ["AWAITING_OWNER_APPROVAL"] },
    { label: "متوقفة بانتظار رفع العائق", statuses: ["BLOCKED"] },
    { label: "معلقة", statuses: ["ON_HOLD"] },
  ],
  QA: [
    { label: "بانتظار اختبارك", statuses: ["AWAITING_TESTING"] },
  ],
  SYSTEM_OWNER: [
    { label: "بانتظار اعتمادك النهائي", statuses: ["AWAITING_OWNER_APPROVAL"] },
  ],
  DEVELOPER: [
    { label: "مجدولة للبدء", statuses: ["SCHEDULED"] },
    { label: "قيد التنفيذ لديك", statuses: ["IN_PROGRESS"] },
    { label: "متوقفة لديك", statuses: ["BLOCKED"] },
  ],
  TICKET_REQUESTER: [
    { label: "بانتظار معلومات منك", statuses: ["AWAITING_INFO"] },
    { label: "بانتظار اعتمادك النهائي", statuses: ["AWAITING_OWNER_APPROVAL"] },
    { label: "مسودات لم تُرسل بعد", statuses: ["DRAFT"] },
  ],
  SENIOR_MANAGEMENT: [],
};

export const TICKET_ACTION_INBOX_KEY = "ACTION";
export const TICKET_OVERDUE_KEY = "OVERDUE";
const QUEUE_PREFIX = "QUEUE:";

export type TicketListView = {
  activeStatus: string;
  activeCompany: string;
  mineOnly: boolean;
  createdOnly: boolean;
  developerId: string;
};

export type TicketStatusShortcut = {
  key: string;
  label: string;
  statuses: readonly string[];
};

export function emptyTicketListView(): TicketListView {
  return {
    activeStatus: "",
    activeCompany: "",
    mineOnly: false,
    createdOnly: false,
    developerId: "",
  };
}

export function ticketActionInboxStatuses(role: UserRole | null | undefined): string[] {
  if (!role) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const bucket of ROLE_TICKET_ACTION_BUCKETS[role] ?? []) {
    for (const status of bucket.statuses) {
      if (seen.has(status)) continue;
      seen.add(status);
      out.push(status);
    }
  }
  return out;
}

function queueKey(statuses: readonly string[]): string {
  return `${QUEUE_PREFIX}${statuses.join(",")}`;
}

/** Combined inbox + multi-status buckets that a single status chip cannot express. */
export function ticketStatusShortcuts(role: UserRole | null | undefined): TicketStatusShortcut[] {
  if (!role) return [];
  const out: TicketStatusShortcut[] = [];
  const inbox = ticketActionInboxStatuses(role);
  if (inbox.length > 1) {
    out.push({ key: TICKET_ACTION_INBOX_KEY, label: TICKET_ACTION_INBOX_LABEL, statuses: inbox });
  }
  for (const bucket of ROLE_TICKET_ACTION_BUCKETS[role] ?? []) {
    if (bucket.statuses.length > 1) {
      out.push({ key: queueKey(bucket.statuses), label: bucket.label, statuses: bucket.statuses });
    }
  }
  return out;
}

/**
 * Opening `/tickets` with no URL intent lands on the queue that role must
 * clear first — assigned work for a developer, approval for the tech head,
 * assignment for the project manager, and so on.
 */
export function ticketListDefaultView(role: UserRole | null | undefined): TicketListView {
  const base = emptyTicketListView();
  if (!role) return base;
  const approvalQueue = ticketStatusShortcuts(role).find((s) => s.key.startsWith(QUEUE_PREFIX));
  switch (role) {
    case "DEVELOPER":
      return { ...base, mineOnly: true };
    case "PROGRAMMING_HEAD":
      return { ...base, activeStatus: approvalQueue?.key ?? "NEW" };
    case "PROJECT_MANAGER":
      return { ...base, activeStatus: "APPROVED" };
    case "QA":
      return { ...base, activeStatus: "AWAITING_TESTING" };
    case "SYSTEM_OWNER":
      return { ...base, activeStatus: "AWAITING_OWNER_APPROVAL" };
    case "TICKET_REQUESTER":
      return { ...base, activeStatus: "AWAITING_INFO" };
    case "SENIOR_MANAGEMENT":
      return base;
    default:
      return base;
  }
}

export function statusKeyToQuery(key: string, role: UserRole | null | undefined): Record<string, string> {
  if (!key) return {};
  if (key === TICKET_OVERDUE_KEY) return { overdue: "true" };
  if (key === TICKET_ACTION_INBOX_KEY) {
    const statuses = ticketActionInboxStatuses(role);
    return statuses.length ? { statuses: statuses.join(",") } : {};
  }
  if (key.startsWith(QUEUE_PREFIX)) return { statuses: key.slice(QUEUE_PREFIX.length) };
  return { status: key };
}

export function statusesParamToKey(param: string, role: UserRole | null | undefined): string {
  const normalized = param.split(",").map((s) => s.trim()).filter(Boolean).join(",");
  if (!normalized) return "";
  const inbox = ticketActionInboxStatuses(role).join(",");
  if (normalized === inbox) return TICKET_ACTION_INBOX_KEY;
  const match = ticketStatusShortcuts(role).find((s) => s.statuses.join(",") === normalized);
  if (match) return match.key;
  if (!normalized.includes(",")) return normalized;
  return queueKey(normalized.split(","));
}

export function ticketListQuery(
  view: TicketListView,
  role: UserRole | null | undefined,
  userId?: string,
): Record<string, string> {
  const q: Record<string, string> = { ...statusKeyToQuery(view.activeStatus, role) };
  if (view.activeCompany) q.companyId = view.activeCompany;
  if (view.mineOnly) q.mine = "true";
  if (view.createdOnly && userId) q.creatorId = userId;
  if (view.developerId) q.developerId = view.developerId;
  return q;
}

export function canFilterCreatedByMe(role: UserRole | null | undefined): boolean {
  return Boolean(role && role !== "TICKET_REQUESTER");
}
