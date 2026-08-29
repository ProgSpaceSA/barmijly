import type { Prisma } from '@prisma/client';

type AttachmentOwner = {
  ticketId?: string | null;
  requirementId?: string | null;
  meetingId?: string | null;
};

type AttachmentSource = {
  meetingId?: string;
  requirementId?: string;
};

/**
 * Copies attachment rows to another owner without duplicating files on disk.
 * Skips rows whose `url` is already linked on the target (same file, one row).
 */
export async function cloneAttachments(
  tx: Prisma.TransactionClient,
  source: AttachmentSource,
  target: AttachmentOwner,
  actorId: string,
): Promise<number> {
  const where = source.meetingId
    ? { meetingId: source.meetingId }
    : { requirementId: source.requirementId! };

  const rows = await tx.ticketAttachment.findMany({ where });
  if (!rows.length) return 0;

  const existingUrls = new Set<string>();
  if (target.ticketId) {
    const onTicket = await tx.ticketAttachment.findMany({
      where: { ticketId: target.ticketId },
      select: { url: true },
    });
    onTicket.forEach((r) => existingUrls.add(r.url));
  }
  if (target.requirementId) {
    const onRequirement = await tx.ticketAttachment.findMany({
      where: { requirementId: target.requirementId },
      select: { url: true },
    });
    onRequirement.forEach((r) => existingUrls.add(r.url));
  }

  const toCreate = rows.filter((row) => !existingUrls.has(row.url));
  if (!toCreate.length) return 0;

  await tx.ticketAttachment.createMany({
    data: toCreate.map((row) => ({
      fileName: row.fileName,
      fileSize: row.fileSize,
      mimeType: row.mimeType,
      url: row.url,
      uploadedById: row.uploadedById ?? actorId,
      ticketId: target.ticketId ?? null,
      requirementId: target.requirementId ?? null,
      meetingId: target.meetingId ?? null,
    })),
  });

  return toCreate.length;
}
