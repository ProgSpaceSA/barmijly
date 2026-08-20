import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketStatus, UserRole } from '@prisma/client';
import { TicketsService } from './tickets.service';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { ApprovalDecision } from './dto/approve-ticket.dto';

/**
 * The action matrix, exercised through the real service rather than the
 * permission table.
 *
 * `permissions.spec.ts` proves the table says the right thing; this proves every
 * endpoint actually consults it. Each case runs the ticket in the status the
 * action expects, so a role that is refused is refused on authorisation and not
 * on a status guard.
 */

const TICKET_ID = 'ticket-1';
const CREATOR_ID = 'creator-1';
const ALL_ROLES = Object.values(UserRole);

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'ف',
  lastName: 'ل',
  companyId: 'company-1',
});

const ticketAt = (status: TicketStatus, overrides: Record<string, any> = {}) => ({
  id: TICKET_ID,
  title: 'تعديل شاشة الفواتير',
  description: 'وصف',
  reason: 'سبب',
  expectedOutcome: 'نتيجة',
  businessImpact: 'أثر',
  status,
  creatorId: CREATOR_ID,
  systemOwnerId: null,
  systemId: 'system-1',
  companyId: 'company-1',
  type: 'MODIFICATION',
  priority: null,
  hasFinancialLoss: false,
  financialLossDetails: null,
  ...overrides,
});

interface Case {
  action: string;
  /** Status the ticket must be in for the action to be reachable. */
  status: TicketStatus;
  allowed: UserRole[];
  /** Runs the action; the actor id defaults to the ticket creator. */
  run: (service: TicketsService, user: any) => Promise<unknown>;
  /** Actions whose ownership check only passes for the creator. */
  actAsCreator?: boolean;
}

const CASES: Case[] = [
  {
    action: 'create',
    status: TicketStatus.DRAFT,
    allowed: ALL_ROLES,
    run: (s, u) =>
      s.create({ title: 't', description: 'd', type: 'MODIFICATION', systemId: 'system-1', companyId: 'company-1' } as any, u),
  },
  {
    action: 'update',
    status: TicketStatus.DRAFT,
    allowed: ALL_ROLES,
    actAsCreator: true,
    run: (s, u) => s.update(TICKET_ID, { title: 'محدث' } as any, u),
  },
  {
    action: 'submit',
    status: TicketStatus.DRAFT,
    allowed: ALL_ROLES,
    actAsCreator: true,
    run: (s, u) => s.submit(TICKET_ID, u),
  },
  {
    action: 'approve',
    status: TicketStatus.NEW,
    allowed: [UserRole.PROGRAMMING_HEAD],
    run: (s, u) => s.approve(TICKET_ID, { decision: ApprovalDecision.APPROVED } as any, u),
  },
  {
    action: 'assign',
    status: TicketStatus.APPROVED,
    allowed: [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER],
    run: (s, u) => s.assign(TICKET_ID, { developerId: 'dev-1', estimatedDeadline: '2026-12-01' } as any, u),
  },
  {
    action: 'startWork',
    status: TicketStatus.SCHEDULED,
    allowed: [UserRole.DEVELOPER],
    run: (s, u) => s.startWork(TICKET_ID, u),
  },
  {
    action: 'submitForTesting',
    status: TicketStatus.IN_PROGRESS,
    allowed: [UserRole.DEVELOPER],
    run: (s, u) => s.submitForTesting(TICKET_ID, u),
  },
  {
    action: 'approveCompletion (testing step)',
    status: TicketStatus.AWAITING_TESTING,
    allowed: [UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
    run: (s, u) => s.approveCompletion(TICKET_ID, u),
  },
  {
    action: 'approveCompletion (owner sign-off)',
    status: TicketStatus.AWAITING_OWNER_APPROVAL,
    allowed: [
      UserRole.TICKET_REQUESTER,
      UserRole.SYSTEM_OWNER,
      UserRole.PROJECT_MANAGER,
      UserRole.PROGRAMMING_HEAD,
    ],
    actAsCreator: true,
    run: (s, u) => s.approveCompletion(TICKET_ID, u),
  },
  {
    action: 'close',
    status: TicketStatus.COMPLETED,
    allowed: [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER],
    run: (s, u) => s.close(TICKET_ID, { closureNotes: 'تم' } as any, u),
  },
  {
    action: 'reopen',
    status: TicketStatus.CLOSED,
    allowed: [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER],
    run: (s, u) => s.reopen(TICKET_ID, u),
  },
  {
    action: 'archive',
    status: TicketStatus.CLOSED,
    allowed: [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT],
    run: (s, u) => s.archive(TICKET_ID, u),
  },
  {
    action: 'unarchive',
    status: TicketStatus.CLOSED,
    allowed: [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT],
    run: (s, u) => s.unarchive(TICKET_ID, u),
  },
  {
    action: 'forceStatus',
    status: TicketStatus.NEW,
    allowed: [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT],
    run: (s, u) => s.forceStatus(TICKET_ID, { status: TicketStatus.ON_HOLD } as any, u),
  },
  {
    action: 'duplicate',
    status: TicketStatus.CLOSED,
    allowed: ALL_ROLES,
    run: (s, u) => s.duplicate(TICKET_ID, u),
  },
];

describe('ticket action matrix', () => {
  let service: TicketsService;
  let prisma: any;

  const currentTicket = (t: any) => {
    prisma.ticket.findUnique.mockResolvedValue(t);
  };

  beforeEach(async () => {
    prisma = {
      ticket: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        // In scope: the scope rules themselves live in access.service.spec.ts.
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: TICKET_ID, ...data })),
        create: jest.fn().mockResolvedValue({ id: 'ticket-new' }),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketApproval: { create: jest.fn().mockResolvedValue({}) },
      ticketComment: { create: jest.fn().mockResolvedValue({}) },
      ticketAssignment: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
      },
      ticketTask: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'dev@company.com',
          firstName: 'م',
          role: UserRole.DEVELOPER,
          isActive: true,
        }),
        // The assign guard asks whether the developer can reach the ticket.
        findMany: jest.fn().mockResolvedValue([{
          id: 'dev-1',
          role: UserRole.DEVELOPER,
          companyId: 'company-1',
          systems: [{ systemId: 'system-1' }],
          companies: [{ companyId: 'company-1' }],
          assignments: [],
          tasksAssigned: [],
          _count: { systems: 1, companies: 1 },
        }]),
      },
      userCompany: { findMany: jest.fn().mockResolvedValue([{ companyId: 'company-1' }]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([{ systemId: 'system-1' }]) },
      system: {
        findUnique: jest.fn().mockResolvedValue({ id: 'system-1', companyId: 'company-1', isActive: true }),
        findMany: jest.fn().mockResolvedValue([{ id: 'system-1' }]),
      },
      notification: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyMany: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: EmailService,
          useValue: { sendStatusUpdate: jest.fn(), sendTicketAssigned: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://barmijly.ai') } },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  describe.each(CASES)('$action', ({ status, allowed, run, actAsCreator }) => {
    it.each(ALL_ROLES)('%s', async (role) => {
      currentTicket(ticketAt(status));
      const user = asUser(role, actAsCreator ? CREATOR_ID : 'actor-1');

      if (allowed.includes(role)) {
        await expect(run(service, user)).resolves.not.toThrow();
      } else {
        await expect(run(service, user)).rejects.toThrow(ForbiddenException);
      }
    });
  });
});

describe('ticket scope restrictions', () => {
  let service: TicketsService;
  let prisma: any;

  const setup = async (overrides: Record<string, any> = {}) => {
    prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(ticketAt(TicketStatus.NEW)),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        create: jest.fn(),
      },
      ticketStatusHistory: { create: jest.fn() },
      ticketAssignment: { findFirst: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
      system: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      notification: { groupBy: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyMany: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: EmailService, useValue: { sendStatusUpdate: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(TicketsService);
  };

  /** The where clause the list actually ran. */
  const listWhere = () => prisma.ticket.findMany.mock.calls[0][0].where;

  beforeEach(() => setup());

  it.each([UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.QA, UserRole.SENIOR_MANAGEMENT])(
    'does not narrow the list for %s',
    async (role) => {
      await service.findAll(asUser(role), {} as any);
      expect(listWhere().AND).toBeUndefined();
    },
  );

  it('narrows the list to own tickets for a requester', async () => {
    await service.findAll(asUser(UserRole.TICKET_REQUESTER, 'req-1'), {} as any);
    expect(listWhere().AND).toContainEqual({ creatorId: 'req-1' });
  });

  it('keeps the scope alongside a search, instead of overwriting it', async () => {
    await service.findAll(asUser(UserRole.DEVELOPER, 'dev-1'), { search: 'فاتورة' } as any);

    const [filters, scope] = listWhere().AND;
    // The search OR and the scope OR have to survive as separate clauses — a
    // merge silently drops one of them.
    expect(filters.OR).toHaveLength(2);
    expect(scope.OR).toEqual(expect.arrayContaining([
      { assignments: { some: { developerId: 'dev-1', isActive: true } } },
    ]));
  });

  it('narrows further to assigned tickets or tasks when mine=true', async () => {
    await service.findAll(asUser(UserRole.DEVELOPER, 'dev-1'), { mine: true } as any);

    const and = listWhere().AND;
    expect(and).toContainEqual({
      OR: [
        { assignments: { some: { developerId: 'dev-1', isActive: true } } },
        { tasks: { some: { assignedToId: 'dev-1' } } },
      ],
    });
  });

  it('refuses a caller-supplied creatorId that tries to widen a requester list', async () => {
    await service.findAll(asUser(UserRole.TICKET_REQUESTER, 'req-1'), { creatorId: 'someone-else' } as any);

    const [filters, scope] = listWhere().AND;
    expect(filters.creatorId).toBe('someone-else');
    // AND-ed with the caller's own id, so the two can never both match.
    expect(scope).toEqual({ creatorId: 'req-1' });
  });

  it.each([UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA])(
    'pins %s to live tickets even when isArchived=true is requested',
    async (role) => {
      await service.findAll(asUser(role), { isArchived: true } as any);
      const where = listWhere();
      const filters = where.AND ? where.AND[0] : where;
      expect(filters.isArchived).toBe(false);
    },
  );

  it.each([UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT])(
    'lets %s open the archive',
    async (role) => {
      await service.findAll(asUser(role), { isArchived: true } as any);
      expect(listWhere().isArchived).toBe(true);
    },
  );

  it('refuses the detail view for a ticket outside the caller scope', async () => {
    await expect(
      service.findOne(TICKET_ID, asUser(UserRole.TICKET_REQUESTER, 'stranger')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('hides internal comments from the business-side roles in the detail query', async () => {
    prisma.ticket.count.mockResolvedValue(1);
    await service.findOne(TICKET_ID, asUser(UserRole.SYSTEM_OWNER, 'owner-1'));

    const include = prisma.ticket.findUnique.mock.calls[0][0].include;
    expect(include.comments.where).toEqual({ visibility: 'PUBLIC' });
  });

  it('shows internal comments to the programming team', async () => {
    prisma.ticket.count.mockResolvedValue(1);
    await service.findOne(TICKET_ID, asUser(UserRole.DEVELOPER, 'dev-1'));

    const include = prisma.ticket.findUnique.mock.calls[0][0].include;
    expect(include.comments.where).toEqual({});
  });

  it('refuses to file against a system the requester was not granted', async () => {
    prisma.system.findUnique.mockResolvedValue({
      id: 'system-9',
      companyId: 'company-9',
      isActive: true,
    });

    await expect(
      service.create(
        { title: 't', description: 'd', type: 'MODIFICATION', systemId: 'system-9', companyId: 'company-9' } as any,
        asUser(UserRole.TICKET_REQUESTER, 'req-1'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('refuses to duplicate a ticket the caller cannot read', async () => {
    await expect(
      service.duplicate(TICKET_ID, asUser(UserRole.TICKET_REQUESTER, 'stranger')),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });
});
