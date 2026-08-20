import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';

const READER = { id: 'user-1', role: UserRole.PROGRAMMING_HEAD };

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('loads the linked ticket on each notification row', async () => {
    await service.findAll(READER);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        ticket: expect.objectContaining({
          select: expect.objectContaining({
            ticketNumber: true,
            estimatedDeadline: true,
            company: expect.anything(),
            system: expect.anything(),
          }),
        }),
      }),
    }));
  });

  it('marks only the current user unread rows for that ticket', async () => {
    await service.markTicketRead('ticket-1', READER.id);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: READER.id, ticketId: 'ticket-1', isRead: false },
      data: { isRead: true },
    });
  });
});
