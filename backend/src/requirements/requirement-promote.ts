import { Priority, RequirementSource, TicketStatus, TicketType } from '@prisma/client';
import { formatMeetingCode, formatRequirementCode } from '../meetings/meeting-code';

/** The fields the promote flow reads off a requirement. */
export interface PromotableRequirement {
  id: string;
  requirementNumber: number;
  title: string;
  description: string | null;
  source: RequirementSource;
  sourceNote: string | null;
  priority: Priority | null;
  systemId: string | null;
  companyId: string;
  requestedByName: string | null;
  dueDate: Date | null;
  ownerId: string | null;
  meetingPoint?: {
    body: string;
    meeting: { title: string; meetingNumber: number; heldAt: Date | null } | null;
  } | null;
}

/** Where the ask came in, in the words the ticket body uses. */
const SOURCE_LABEL: Record<RequirementSource, string> = {
  [RequirementSource.MEETING]: 'اجتماع',
  [RequirementSource.WHATSAPP]: 'واتساب',
  [RequirementSource.EMAIL]: 'بريد إلكتروني',
  [RequirementSource.DOCUMENT]: 'مستند',
  [RequirementSource.CALL]: 'مكالمة',
  [RequirementSource.OTHER]: 'مصدر آخر',
};

/**
 * The origin line: where this ask came from, in one sentence.
 *
 * A meeting-sourced requirement names the minutes it was captured from, so the
 * developer reading the ticket a month later can find the room it was said in
 * rather than guessing who wanted it.
 */
export function renderOrigin(requirement: PromotableRequirement): string {
  const meeting = requirement.meetingPoint?.meeting;
  if (requirement.source === RequirementSource.MEETING && meeting) {
    const code = formatMeetingCode(meeting.meetingNumber);
    const when = meeting.heldAt ? ` بتاريخ ${meeting.heldAt.toISOString().slice(0, 10)}` : '';
    return `طُلب في اجتماع «${meeting.title}» (${code})${when}.`;
  }

  const label = SOURCE_LABEL[requirement.source];
  const note = requirement.sourceNote?.trim();
  return note ? `ورد عبر ${label} — ${note}.` : `ورد عبر ${label}.`;
}

/**
 * Builds the ticket a promoted requirement becomes.
 *
 * It lands at `DRAFT` on purpose. Promotion is how leadership turns a tracked
 * ask into work, not a way around the workflow: the ticket still goes
 * DRAFT → NEW → AWAITING_APPROVAL and still needs `PROGRAMMING_HEAD` approval
 * before any development starts (AGENTS.md core rules, req.md §8 and §21).
 */
export function buildRequirementTicket(
  requirement: PromotableRequirement,
  actorId: string,
  overrides?: { title?: string; type?: TicketType },
) {
  const code = formatRequirementCode(requirement.requirementNumber);
  const origin = renderOrigin(requirement);
  const asker = requirement.requestedByName?.trim();

  const description = [
    requirement.description?.trim() || requirement.title,
    requirement.meetingPoint?.body && `\n**نص البند في المحضر**\n${requirement.meetingPoint.body}`,
  ]
    .filter(Boolean)
    .join('\n');

  const trimmedTitle = overrides?.title?.trim();

  return {
    title: trimmedTitle || `(${code}) ${requirement.title}`,
    description,
    reason: asker ? `${origin} الطلب من ${asker}.` : origin,
    expectedOutcome: requirement.description?.trim() || requirement.title,
    businessImpact: `متطلب متابَع من لوحة المتطلبات — ${code}.`,
    status: TicketStatus.DRAFT,
    type: overrides?.type ?? TicketType.NEW_FEATURE,
    priority: requirement.priority,
    estimatedDeadline: requirement.dueDate ?? undefined,
    // Guarded by the service: promote refuses a requirement with no system.
    systemId: requirement.systemId as string,
    companyId: requirement.companyId,
    creatorId: actorId,
    requirementId: requirement.id,
  };
}
