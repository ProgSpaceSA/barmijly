import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, UserRole } from '@prisma/client';
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
        create: jest.fn().mockResolvedValue({ id: 'n-1' }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
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

  describe('never notify the actor', () => {
    const payload = { type: NotificationType.COMMENT_ADDED, title: 'ت', body: 'ن', ticketId: 't-1' };

    it('skips notify when the recipient is the person who acted', async () => {
      await service.notify(READER.id, payload, READER.id);

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('still notifies a different recipient', async () => {
      await service.notify('other-1', payload, READER.id);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'other-1', ...payload },
      });
    });

    it('drops the actor from a notifyMany list', async () => {
      await service.notifyMany([READER.id, 'other-1', READER.id], payload, READER.id);

      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'other-1', ...payload }],
      });
    });

    it('creates nothing when notifyMany is only the actor', async () => {
      const result = await service.notifyMany([READER.id], payload, READER.id);

      expect(result).toEqual({ count: 0 });
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });
  });
});
