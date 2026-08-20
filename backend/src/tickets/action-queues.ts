import { TicketStatus, UserRole } from '@prisma/client';

export interface ActionBucket {
  label: string;
  statuses: TicketStatus[];
}

/**
 * Statuses each role is expected to act on. Shared by the daily digest and the
 * dashboard activity hub so a ticket that lands in the morning email also
 * appears on the terminal. A bucket only lists statuses that role can move.
 */
export const ACTION_BUCKETS: Record<UserRole, ActionBucket[]> = {
  [UserRole.PROGRAMMING_HEAD]: [
    { label: 'بانتظار اعتمادك', statuses: [TicketStatus.NEW, TicketStatus.AWAITING_APPROVAL] },
    { label: 'معتمدة بانتظار الإسناد', statuses: [TicketStatus.APPROVED] },
    { label: 'بانتظار الاختبار', statuses: [TicketStatus.AWAITING_TESTING] },
    { label: 'بانتظار اعتماد الإغلاق', statuses: [TicketStatus.AWAITING_OWNER_APPROVAL] },
  ],
  [UserRole.PROJECT_MANAGER]: [
    { label: 'معتمدة بانتظار الإسناد', statuses: [TicketStatus.APPROVED] },
    { label: 'بانتظار الاختبار', statuses: [TicketStatus.AWAITING_TESTING] },
    { label: 'بانتظار اعتماد الإغلاق', statuses: [TicketStatus.AWAITING_OWNER_APPROVAL] },
  ],
  [UserRole.QA]: [
    { label: 'بانتظار اختبارك', statuses: [TicketStatus.AWAITING_TESTING] },
  ],
  [UserRole.SYSTEM_OWNER]: [
    { label: 'بانتظار اعتمادك النهائي', statuses: [TicketStatus.AWAITING_OWNER_APPROVAL] },
  ],
  [UserRole.DEVELOPER]: [
    { label: 'مجدولة للبدء', statuses: [TicketStatus.SCHEDULED] },
    { label: 'قيد التنفيذ لديك', statuses: [TicketStatus.IN_PROGRESS] },
  ],
  [UserRole.TICKET_REQUESTER]: [
    { label: 'بانتظار معلومات منك', statuses: [TicketStatus.AWAITING_INFO] },
    { label: 'بانتظار اعتمادك النهائي', statuses: [TicketStatus.AWAITING_OWNER_APPROVAL] },
    { label: 'مسودات لم تُرسل بعد', statuses: [TicketStatus.DRAFT] },
  ],
  [UserRole.SENIOR_MANAGEMENT]: [],
};

export function actionQueueStatuses(role: UserRole): TicketStatus[] {
  return [...new Set((ACTION_BUCKETS[role] ?? []).flatMap((b) => b.statuses))];
}
