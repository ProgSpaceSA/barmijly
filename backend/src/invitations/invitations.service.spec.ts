import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvitationStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

jest.mock('uuid', () => ({ v4: () => 'new-token' }));

import { InvitationsService } from './invitations.service';

const INV_ID = 'inv-1';
const pending = {
  id: INV_ID,
  email: 'badr@company.com',
  role: UserRole.DEVELOPER,
  status: InvitationStatus.PENDING,
  token: 'old-token',
  receiverId: 'user-1',
  companyId: 'company-1',
};

describe('InvitationsService', () => {
  let service: InvitationsService;
  let prisma: {
    emailInvitation: { findUnique: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock };
    company: { findMany: jest.Mock };
    system: { findMany: jest.Mock };
  };
  let email: { sendInvitation: jest.Mock };

  beforeEach(async () => {
    prisma = {
      emailInvitation: {
        findUnique: jest.fn().mockResolvedValue(pending),
        update: jest.fn().mockResolvedValue({ ...pending, status: InvitationStatus.PENDING }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          companyId: 'company-1',
          systems: [{ systemId: 'system-1' }],
          companies: [{ companyId: 'company-1' }],
        }),
      },
      company: {
        findMany: jest.fn().mockResolvedValue([{ name: 'شركة الاختبار' }]),
      },
      system: {
        findMany: jest.fn().mockResolvedValue([{ name: 'نظام الاختبار' }]),
      },
    };
    email = { sendInvitation: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: email },
        { provide: ConfigService, useValue: { get: () => 'http://localhost:3000' } },
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
  });

  describe('resend', () => {
    it('refreshes the token for a pending invitation', async () => {
      await service.resend(INV_ID);

      expect(prisma.emailInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INV_ID },
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
      expect(email.sendInvitation).toHaveBeenCalled();
    });

    it('reactivates an expired invitation', async () => {
      prisma.emailInvitation.findUnique.mockResolvedValue({ ...pending, status: InvitationStatus.EXPIRED });

      await service.resend(INV_ID);

      expect(prisma.emailInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('rejects resend for an accepted invitation', async () => {
      prisma.emailInvitation.findUnique.mockResolvedValue({ ...pending, status: InvitationStatus.ACCEPTED });

      await expect(service.resend(INV_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(email.sendInvitation).not.toHaveBeenCalled();
    });

    it('throws when the invitation is missing', async () => {
      prisma.emailInvitation.findUnique.mockResolvedValue(null);

      await expect(service.resend(INV_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
