import { BugSeverity, Priority, TicketStatus, TicketType } from '@prisma/client';

/** The fields the promote flow reads off a bug. */
export interface PromotableBug {
  id: string;
  bugNumber: number;
  title: string;
  description: string;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  environment: string | null;
  severity: BugSeverity;
  priority: Priority | null;
  systemId: string;
  companyId: string;
  ticketId: string | null;
}

export interface PromotableStep {
  order: number;
  body: string;
  attachments?: { url: string; fileName: string }[];
}

/** Impact, in the words the ticket form uses. */
const SEVERITY_IMPACT: Record<BugSeverity, string> = {
  [BugSeverity.BLOCKER]: 'خطأ مُعطِّل يوقف استخدام النظام.',
  [BugSeverity.CRITICAL]: 'خطأ حرج يؤثر على عملية أساسية.',
  [BugSeverity.MAJOR]: 'خطأ كبير يعطّل جزءاً من العمل.',
  [BugSeverity.MINOR]: 'خطأ بسيط لا يمنع إتمام العمل.',
  [BugSeverity.TRIVIAL]: 'ملاحظة طفيفة على التجربة.',
};

/**
 * Renders repro steps as a numbered markdown list, screenshots inline.
 *
 * The steps are rows, not prose, but a ticket body is prose — so they are
 * flattened once, here, rather than leaving the reader to open the bug to find
 * out how to reproduce it. Each screenshot lands under its own step so the
 * image and the sentence it illustrates stay together.
 */
export function renderReproSteps(steps: PromotableStep[]): string {
  if (!steps.length) return '';
  return [...steps]
    .sort((a, b) => a.order - b.order)
    .map((step, index) => {
      const line = `${index + 1}. ${step.body}`;
      const shots = (step.attachments ?? []).map(
        (file) => `\n   ![${file.fileName}](${file.url})`,
      );
      return line + shots.join('');
    })
    .join('\n');
}

/**
 * Builds the `BUG_FIX` ticket a promoted bug becomes.
 *
 * It lands at `DRAFT` on purpose. Promotion is a convenience for QA, not a way
 * around the workflow: the ticket still goes DRAFT → NEW → AWAITING_APPROVAL
 * and still needs `PROGRAMMING_HEAD` approval before any development starts
 * (AGENTS.md core rules, req.md §8 and §21).
 */
export function buildBugFixTicket(
  bug: PromotableBug,
  steps: PromotableStep[],
  actorId: string,
  titleOverride?: string,
) {
  const repro = renderReproSteps(steps);
  const bugCode = `BUG-${String(bug.bugNumber).padStart(4, '0')}`;

  const description = [
    bug.description,
    repro && `\n**خطوات إعادة الإنتاج**\n${repro}`,
    bug.expectedBehavior && `\n**السلوك المتوقع**\n${bug.expectedBehavior}`,
    bug.actualBehavior && `\n**السلوك الفعلي**\n${bug.actualBehavior}`,
    bug.environment && `\n**البيئة**\n${bug.environment}`,
  ]
    .filter(Boolean)
    .join('\n');

  const trimmedOverride = titleOverride?.trim();

  return {
    title: trimmedOverride || `(${bugCode}) ${bug.title}`,
    description,
    reason: `تم رصد خطأ أثناء الاختبار — ${bugCode}.`,
    expectedOutcome:
      bug.expectedBehavior?.trim() || 'إصلاح الخطأ وعودة النظام للسلوك المتوقع.',
    businessImpact: SEVERITY_IMPACT[bug.severity],
    status: TicketStatus.DRAFT,
    type: TicketType.BUG_FIX,
    priority: bug.priority,
    systemId: bug.systemId,
    companyId: bug.companyId,
    creatorId: actorId,
  };
}
