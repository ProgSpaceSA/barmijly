import { Priority, RequirementSource, TicketStatus, TicketType } from '@prisma/client';
import {
  PromotableRequirement,
  buildRequirementTicket,
  renderOrigin,
} from './requirement-promote';

const base: PromotableRequirement = {
  id: 'req-1',
  requirementNumber: 4,
  title: 'تقرير مبيعات يومي',
  description: 'يريد الرئيس التنفيذي تقريراً يومياً بالمبيعات.',
  source: RequirementSource.MEETING,
  sourceNote: null,
  priority: Priority.HIGH,
  systemId: 'system-1',
  companyId: 'company-1',
  requestedByName: 'الرئيس التنفيذي',
  ownerId: null,
  dueDate: null,
  meetingPoint: {
    body: 'نريد تقريراً يومياً للمبيعات',
    meeting: {
      title: 'مراجعة الرئيس التنفيذي',
      meetingNumber: 7,
      heldAt: new Date('2026-08-20T09:00:00.000Z'),
    },
  },
};

describe('renderOrigin', () => {
  it('names the meeting and its code', () => {
    expect(renderOrigin(base)).toContain('MTG-0007');
    expect(renderOrigin(base)).toContain('مراجعة الرئيس التنفيذي');
    expect(renderOrigin(base)).toContain('2026-08-20');
  });

  it('falls back to the source label when there is no meeting', () => {
    const origin = renderOrigin({
      ...base,
      source: RequirementSource.WHATSAPP,
      meetingPoint: null,
      sourceNote: 'واتساب من م. أحمد',
    });
    expect(origin).toContain('واتساب');
    expect(origin).toContain('م. أحمد');
  });

  it('drops the dash when there is no note', () => {
    const origin = renderOrigin({
      ...base,
      source: RequirementSource.CALL,
      meetingPoint: null,
      sourceNote: null,
    });
    expect(origin).toBe('ورد عبر مكالمة.');
  });

  it('does not claim a meeting when source says MEETING but the point is gone', () => {
    const origin = renderOrigin({ ...base, meetingPoint: null });
    expect(origin).toBe('ورد عبر اجتماع.');
  });
});

describe('buildRequirementTicket', () => {
  it('lands at DRAFT — approval is never bypassed', () => {
    expect(buildRequirementTicket(base, 'actor-1').status).toBe(TicketStatus.DRAFT);
  });

  it('defaults to NEW_FEATURE and honours an override', () => {
    expect(buildRequirementTicket(base, 'actor-1').type).toBe(TicketType.NEW_FEATURE);
    expect(
      buildRequirementTicket(base, 'actor-1', { type: TicketType.MODIFICATION }).type,
    ).toBe(TicketType.MODIFICATION);
  });

  it('prefixes the title with the requirement code', () => {
    expect(buildRequirementTicket(base, 'actor-1').title).toBe(
      '(REQ-0004) تقرير مبيعات يومي',
    );
  });

  it('takes a title override verbatim', () => {
    expect(
      buildRequirementTicket(base, 'actor-1', { title: '  تقرير المبيعات  ' }).title,
    ).toBe('تقرير المبيعات');
  });

  it('ignores a blank override rather than shipping an empty title', () => {
    expect(buildRequirementTicket(base, 'actor-1', { title: '   ' }).title).toBe(
      '(REQ-0004) تقرير مبيعات يومي',
    );
  });

  it('carries the minutes line into the body', () => {
    const ticket = buildRequirementTicket(base, 'actor-1');
    expect(ticket.description).toContain('نريد تقريراً يومياً للمبيعات');
    expect(ticket.description).toContain('نص البند في المحضر');
  });

  it('names who asked in the reason', () => {
    expect(buildRequirementTicket(base, 'actor-1').reason).toContain('الرئيس التنفيذي');
  });

  it('carries scope, priority and the back-link', () => {
    const ticket = buildRequirementTicket(base, 'actor-1');
    expect(ticket).toMatchObject({
      systemId: 'system-1',
      companyId: 'company-1',
      priority: Priority.HIGH,
      creatorId: 'actor-1',
      requirementId: 'req-1',
    });
  });

  it('falls back to the title when there is no description', () => {
    const ticket = buildRequirementTicket({ ...base, description: null }, 'actor-1');
    expect(ticket.description).toContain('تقرير مبيعات يومي');
    expect(ticket.expectedOutcome).toBe('تقرير مبيعات يومي');
  });

  it('carries the due date onto the ticket deadline', () => {
    const due = new Date('2026-09-05T00:00:00.000Z');
    const ticket = buildRequirementTicket({ ...base, dueDate: due }, 'actor-1');
    expect(ticket.estimatedDeadline).toEqual(due);
  });
});
