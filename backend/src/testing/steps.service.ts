import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TestState } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TestingAccessService, TestingActor } from './testing.access';
import { moveTo } from './cases.service';
import { CreateStepDto, UpdateStepDto } from './dto/step.dto';

const STEP_INCLUDE = { attachments: true } as const;

/**
 * Ordered steps, one implementation for two callers: a test case's execution
 * steps and a bug's reproduction steps.
 *
 * They are the same object — a numbered line with an optional screenshot — and
 * the UI renders them with one component pair, so splitting them here would be
 * two copies of the same reorder logic drifting apart. Exactly one of
 * `testCaseId` / `bugId` is ever set; `owner()` is what resolves which, and
 * every gate goes through it.
 */
@Injectable()
export class StepsService {
  private uploadDir: string;

  constructor(
    private prisma: PrismaService,
    private testing: TestingAccessService,
    config: ConfigService,
  ) {
    this.uploadDir = config.get<string>('UPLOAD_DIR', './uploads');
  }

  // -------------------------------------------------------------------- read

  async findForCase(testCaseId: string, user: TestingActor) {
    await this.testing.loadVisibleCase(testCaseId, user);
    return this.prisma.testStep.findMany({
      where: { testCaseId },
      include: STEP_INCLUDE,
      orderBy: { order: 'asc' },
    });
  }

  async findForBug(bugId: string, user: TestingActor) {
    await this.testing.loadVisibleBug(bugId, user);
    return this.prisma.testStep.findMany({
      where: { bugId },
      include: STEP_INCLUDE,
      orderBy: { order: 'asc' },
    });
  }

  // ------------------------------------------------------------------- write

  /** Appends a step to a case. Authoring the case is authoring its steps. */
  async addToCase(testCaseId: string, dto: CreateStepDto, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const testCase = await this.testing.loadVisibleCase(testCaseId, user);
    if (testCase.state === TestState.ARCHIVED) {
      throw new BadRequestException('الحالة مؤرشفة ولا يمكن تعديلها');
    }
    return this.append({ testCaseId }, dto.body ?? '');
  }

  /** Appends a repro step to a bug. Whoever may edit the bug may edit its steps. */
  async addToBug(bugId: string, dto: CreateStepDto, user: TestingActor) {
    const bug = await this.testing.loadVisibleBug(bugId, user);
    this.assertCanEditBug(bug, user);
    return this.append({ bugId }, dto.body ?? '');
  }

  async update(id: string, dto: UpdateStepDto, user: TestingActor) {
    const step = await this.loadStep(id);
    await this.assertCanEditStep(step, user);

    if (dto.body === undefined) return step;
    return this.prisma.testStep.update({
      where: { id },
      data: { body: dto.body },
      include: STEP_INCLUDE,
    });
  }

  /**
   * Moves a step and rewrites every sibling to a contiguous position. Gaps
   * would work, but they make «الخطوة ٣» in the UI and `order = 7` in the row
   * two different numbers, and the next reorder has to reconcile them.
   */
  async reorder(id: string, order: number, user: TestingActor) {
    const step = await this.loadStep(id);
    await this.assertCanEditStep(step, user);

    const where = step.testCaseId ? { testCaseId: step.testCaseId } : { bugId: step.bugId };
    const siblings = await this.prisma.testStep.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const reordered = moveTo(siblings.map((s) => s.id), id, order);
    await this.prisma.$transaction(
      reordered.map((rowId, index) =>
        this.prisma.testStep.update({ where: { id: rowId }, data: { order: index } }),
      ),
    );

    return this.prisma.testStep.findMany({
      where,
      include: STEP_INCLUDE,
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Deletes a step and the screenshot hanging off it. The attachment row
   * cascades on the foreign key; the file on disk does not, so it goes here.
   */
  async remove(id: string, user: TestingActor) {
    const step = await this.loadStep(id);
    await this.assertCanEditStep(step, user);

    const attachments = await this.prisma.ticketAttachment.findMany({
      where: { testStepId: id },
      select: { url: true },
    });
    for (const attachment of attachments) {
      const filePath = path.join(this.uploadDir, path.basename(attachment.url));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    const deleted = await this.prisma.testStep.delete({ where: { id } });

    // Close the gap the removed step left behind.
    const where = step.testCaseId ? { testCaseId: step.testCaseId } : { bugId: step.bugId };
    const remaining = await this.prisma.testStep.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (remaining.length) {
      await this.prisma.$transaction(
        remaining.map((row, index) =>
          this.prisma.testStep.update({ where: { id: row.id }, data: { order: index } }),
        ),
      );
    }

    return deleted;
  }

  // ----------------------------------------------------------------- helpers

  private async append(owner: { testCaseId?: string; bugId?: string }, body: string) {
    const where = owner.testCaseId ? { testCaseId: owner.testCaseId } : { bugId: owner.bugId };
    const last = await this.prisma.testStep.findFirst({
      where,
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    return this.prisma.testStep.create({
      data: { ...owner, body, order: (last?.order ?? -1) + 1 },
      include: STEP_INCLUDE,
    });
  }

  private async loadStep(id: string) {
    const step = await this.prisma.testStep.findUnique({
      where: { id },
      include: STEP_INCLUDE,
    });
    if (!step) throw new NotFoundException('Step not found');
    return step;
  }

  /** A step is only ever as reachable as the case or bug it belongs to. */
  private async assertCanEditStep(
    step: { testCaseId: string | null; bugId: string | null },
    user: TestingActor,
  ) {
    if (step.testCaseId) {
      this.testing.assertCanAuthor(user);
      const testCase = await this.testing.loadVisibleCase(step.testCaseId, user);
      if (testCase.state === TestState.ARCHIVED) {
        throw new BadRequestException('الحالة مؤرشفة ولا يمكن تعديلها');
      }
      return;
    }
    if (step.bugId) {
      const bug = await this.testing.loadVisibleBug(step.bugId, user);
      this.assertCanEditBug(bug, user);
      return;
    }
    throw new BadRequestException('Step is not linked to a case or a bug');
  }

  /**
   * Editing a bug's repro steps needs the same reach as filing it: whoever
   * reported it, or anyone who may assign bugs. Kept here rather than in
   * `BugsService` so a step write and a bug write cannot disagree.
   */
  private assertCanEditBug(
    bug: { id: string; reportedById: string; isArchived: boolean; systemId: string; companyId: string },
    user: TestingActor,
  ): void {
    if (bug.isArchived) throw new BadRequestException('الخطأ مؤرشف ولا يمكن تعديله');
    if (this.testing.can(user, 'bug:assign')) return;
    if (bug.reportedById === user.id) {
      this.testing.assertCan(user, 'bug:create');
      return;
    }
    this.testing.assertCan(user, 'bug:assign');
  }
}
