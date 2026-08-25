import { BugSeverity, Priority, TicketStatus, TicketType } from '@prisma/client';
import { buildBugFixTicket, renderReproSteps, PromotableBug } from './bug-promote';

const bug = (over: Partial<PromotableBug> = {}): PromotableBug => ({
  id: 'bug-1',
  bugNumber: 114,
  title: 'زر الحفظ لا يستجيب',
  description: 'الضغط على الحفظ لا يفعل شيئاً.',
  expectedBehavior: 'تُحفظ البيانات وتظهر رسالة نجاح.',
  actualBehavior: 'لا شيء يحدث.',
  environment: 'Chrome 141 · بيئة الاختبار',
  severity: BugSeverity.MAJOR,
  priority: Priority.HIGH,
  systemId: 'system-1',
  companyId: 'company-1',
  ticketId: null,
  ...over,
});

describe('renderReproSteps', () => {
  it('numbers the steps in order, not in the order they arrived', () => {
    const out = renderReproSteps([
      { order: 2, body: 'اضغط حفظ' },
      { order: 0, body: 'افتح الصفحة' },
      { order: 1, body: 'املأ الحقول' },
    ]);

    expect(out).toBe('1. افتح الصفحة\n2. املأ الحقول\n3. اضغط حفظ');
  });

  it('hangs each screenshot under its own step', () => {
    const out = renderReproSteps([
      { order: 0, body: 'افتح الصفحة', attachments: [{ url: '/uploads/a.png', fileName: 'a.png' }] },
      { order: 1, body: 'اضغط حفظ' },
    ]);

    expect(out).toBe('1. افتح الصفحة\n   ![a.png](/uploads/a.png)\n2. اضغط حفظ');
  });

  it('returns nothing at all for a bug with no steps', () => {
    expect(renderReproSteps([])).toBe('');
  });
});

describe('buildBugFixTicket', () => {
  it('lands at DRAFT as a BUG_FIX — promotion never skips approval', () => {
    const ticket = buildBugFixTicket(bug(), [], 'qa-7');

    expect(ticket.status).toBe(TicketStatus.DRAFT);
    expect(ticket.type).toBe(TicketType.BUG_FIX);
  });

  it('files the ticket under the promoting user, in the bug’s own scope', () => {
    const ticket = buildBugFixTicket(bug(), [], 'qa-7');

    expect(ticket).toMatchObject({
      creatorId: 'qa-7',
      systemId: 'system-1',
      companyId: 'company-1',
      priority: Priority.HIGH,
    });
  });

  it('carries the bug code in the title so the two are findable from either end', () => {
    expect(buildBugFixTicket(bug(), [], 'qa-7').title).toBe('(BUG-0114) زر الحفظ لا يستجيب');
  });

  it('accepts a title override instead of the default format', () => {
    expect(buildBugFixTicket(bug(), [], 'qa-7', 'عنوان مخصص').title).toBe('عنوان مخصص');
  });

  it('folds the repro steps into the description as a numbered list', () => {
    const ticket = buildBugFixTicket(bug(), [
      { order: 0, body: 'افتح الصفحة' },
      { order: 1, body: 'اضغط حفظ' },
    ], 'qa-7');

    expect(ticket.description).toContain('1. افتح الصفحة');
    expect(ticket.description).toContain('2. اضغط حفظ');
    expect(ticket.description).toContain('خطوات إعادة الإنتاج');
  });

  it('keeps the expected and actual behaviour rather than dropping them', () => {
    const ticket = buildBugFixTicket(bug(), [], 'qa-7');
    expect(ticket.description).toContain('تُحفظ البيانات وتظهر رسالة نجاح.');
    expect(ticket.description).toContain('لا شيء يحدث.');
    expect(ticket.description).toContain('Chrome 141');
  });

  it('fills every required ticket field, even when the bug left them blank', () => {
    const ticket = buildBugFixTicket(
      bug({ expectedBehavior: null, actualBehavior: null, environment: null, priority: null }),
      [],
      'qa-7',
    );

    expect(ticket.reason).toBeTruthy();
    expect(ticket.expectedOutcome).toBeTruthy();
    expect(ticket.businessImpact).toBeTruthy();
    expect(ticket.priority).toBeNull();
  });

  it('describes the impact from the severity, so the ticket form is not left empty', () => {
    expect(buildBugFixTicket(bug({ severity: BugSeverity.BLOCKER }), [], 'q').businessImpact).not.toBe(
      buildBugFixTicket(bug({ severity: BugSeverity.TRIVIAL }), [], 'q').businessImpact,
    );
  });
});
