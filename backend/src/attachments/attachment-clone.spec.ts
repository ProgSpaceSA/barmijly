import { cloneAttachments } from './attachment-clone';

describe('cloneAttachments', () => {
  const tx = {
    ticketAttachment: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies meeting files onto a new requirement', async () => {
    tx.ticketAttachment.findMany
      .mockResolvedValueOnce([
        {
          fileName: 'a.pdf',
          fileSize: 10,
          mimeType: 'application/pdf',
          url: '/uploads/a.pdf',
          uploadedById: 'u1',
        },
      ])
      .mockResolvedValueOnce([]);

    const count = await cloneAttachments(
      tx as any,
      { meetingId: 'meet-1' },
      { requirementId: 'req-1' },
      'actor-1',
    );

    expect(count).toBe(1);
    expect(tx.ticketAttachment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          url: '/uploads/a.pdf',
          requirementId: 'req-1',
          meetingId: null,
        }),
      ],
    });
  });

  it('skips urls already on the target ticket', async () => {
    tx.ticketAttachment.findMany
      .mockResolvedValueOnce([
        {
          fileName: 'a.pdf',
          fileSize: 10,
          mimeType: 'application/pdf',
          url: '/uploads/a.pdf',
          uploadedById: 'u1',
        },
      ])
      .mockResolvedValueOnce([{ url: '/uploads/a.pdf' }]);

    const count = await cloneAttachments(
      tx as any,
      { requirementId: 'req-1' },
      { ticketId: 'ticket-1' },
      'actor-1',
    );

    expect(count).toBe(0);
    expect(tx.ticketAttachment.createMany).not.toHaveBeenCalled();
  });
});
