import {
  Prisma,
  PrismaClient,
  UserRole,
  TicketStatus,
  TicketType,
  Priority,
  CommentVisibility,
  NotificationType,
  TaskStatus,
  InvitationStatus,
  SignupRequestStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import {
  COMPANY_COUNT,
  PROJECT_COUNT,
  ROLE_MATRIX,
  SCOPE_TAGS,
  SEED_PASSWORD,
  companyOfProject,
  displayName,
  lastNameFor,
  loginAccounts,
  seedEmail,
  type RoleKey,
  type Scope,
} from './seed-matrix';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const COMPANIES = Array.from({ length: COMPANY_COUNT }, (_, i) => i + 1);
const PROJECTS = Array.from({ length: PROJECT_COUNT }, (_, i) => i + 1);
const FULL_PROJECTS = new Set([1, 2, 3]);
const COMMENT_PROJECTS = [1, 2, 3, 12];
const NBSP = '\u00A0';
const RLM = '\u200F';

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

type SeedUser = { id: string; email: string; firstName: string; lastName: string; role: UserRole };

const roster: Record<RoleKey, Record<string, SeedUser>> = {
  ticketRequester: {},
  systemOwner: {},
  programmingHead: {},
  projectManager: {},
  developer: {},
  qa: {},
  seniorManagement: {},
};

function mention(user: SeedUser) {
  return `@${user.firstName}${NBSP}${user.lastName}`;
}

function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
}

function writeUploads() {
  const dir = uploadDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const n of COMPANIES) {
    fs.writeFileSync(path.join(dir, `seed-logo-c${n}.png`), PNG);
    fs.writeFileSync(path.join(dir, `seed-file-c${n}.txt`), `مواصفات شركة ${n}\n`, 'utf8');
  }
  for (const n of PROJECTS) {
    fs.writeFileSync(path.join(dir, `seed-cover-p${n}.png`), PNG);
    fs.writeFileSync(path.join(dir, `seed-comment-p${n}.txt`), `مرفق تعليق على مشروع ${n}\n`, 'utf8');
  }
}

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production');
  }
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ticketDependency.deleteMany();
  await prisma.ticketApproval.deleteMany();
  await prisma.ticketAssignment.deleteMany();
  await prisma.ticketStatusHistory.deleteMany();
  await prisma.ticketAttachment.deleteMany();
  await prisma.ticketTask.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.userSystem.deleteMany();
  await prisma.userCompany.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailInvitation.deleteMany();
  await prisma.signupRequest.deleteMany();
  await prisma.ticketTemplate.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.system.deleteMany();
  await prisma.company.deleteMany();

  const seqRows = await prisma.$queryRaw<{ seq: string | null }[]>`
    SELECT pg_get_serial_sequence('"Ticket"', 'ticketNumber') AS seq
  `;
  const seq = seqRows[0]?.seq;
  if (seq) {
    await prisma.$executeRawUnsafe(`SELECT setval('${seq.replace(/'/g, "''")}', 1, false)`);
  }
}

type TicketSpec = {
  key: string;
  status: TicketStatus;
  type: TicketType;
  priority: Priority;
  finalPriority?: Priority;
  assign?: boolean;
  assignP13?: boolean;
  archived?: boolean;
  overdueDays?: number;
  closureNotes?: string;
  titleAr: string;
};

function fullTicketSpecs(): TicketSpec[] {
  return [
    { key: 'draft', status: TicketStatus.DRAFT, type: TicketType.MODIFICATION, priority: Priority.MEDIUM, titleAr: 'إضافة حقل الرقم الضريبي' },
    { key: 'new', status: TicketStatus.NEW, type: TicketType.BUG_FIX, priority: Priority.HIGH, titleAr: 'خطأ في احتساب الخصم' },
    { key: 'info', status: TicketStatus.AWAITING_INFO, type: TicketType.REPORT_DASHBOARD, priority: Priority.MEDIUM, titleAr: 'تقرير حركة المخزون الشهري' },
    { key: 'awaiting-approval', status: TicketStatus.AWAITING_APPROVAL, type: TicketType.API_INTEGRATION, priority: Priority.HIGH, titleAr: 'ربط بوابة الدفع الإلكتروني' },
    { key: 'approved', status: TicketStatus.APPROVED, type: TicketType.PERFORMANCE, priority: Priority.MEDIUM, finalPriority: Priority.HIGH, titleAr: 'تحسين سرعة شاشة الأصناف' },
    { key: 'rejected', status: TicketStatus.REJECTED, type: TicketType.UI_IMPROVEMENT, priority: Priority.LOW, titleAr: 'طلب تغيير ألوان الواجهة' },
    { key: 'scheduled', status: TicketStatus.SCHEDULED, type: TicketType.USER_PERMISSIONS, priority: Priority.MEDIUM, finalPriority: Priority.MEDIUM, assign: true, titleAr: 'إضافة صلاحية مراجع الحسابات' },
    { key: 'in-progress', status: TicketStatus.IN_PROGRESS, type: TicketType.EMERGENCY, priority: Priority.CRITICAL, finalPriority: Priority.CRITICAL, assign: true, overdueDays: -2, titleAr: 'توقف النظام عند إصدار الفواتير' },
    { key: 'testing', status: TicketStatus.AWAITING_TESTING, type: TicketType.BUG_FIX, priority: Priority.HIGH, finalPriority: Priority.HIGH, assign: true, titleAr: 'شاشة الإجازات لا تحفظ المرفقات' },
    { key: 'owner-approval', status: TicketStatus.AWAITING_OWNER_APPROVAL, type: TicketType.NEW_FEATURE, priority: Priority.MEDIUM, finalPriority: Priority.MEDIUM, assign: true, titleAr: 'تنبيه انتهاء صلاحية المنتجات' },
    { key: 'completed', status: TicketStatus.COMPLETED, type: TicketType.REPORT_DASHBOARD, priority: Priority.HIGH, finalPriority: Priority.HIGH, assign: true, overdueDays: -1, titleAr: 'لوحة مؤشرات مبيعات الفروع' },
    { key: 'closed', status: TicketStatus.CLOSED, type: TicketType.NEW_FEATURE, priority: Priority.MEDIUM, finalPriority: Priority.MEDIUM, assign: true, overdueDays: -10, closureNotes: 'تم التنفيذ والنشر على الإنتاج، وتم تدريب الفريق.', titleAr: 'تصدير كشف الرواتب إلى Excel' },
    { key: 'on-hold', status: TicketStatus.ON_HOLD, type: TicketType.TECHNICAL_CONSULTATION, priority: Priority.LOW, titleAr: 'إعادة هيكلة النظام (مشروع مستقل)' },
    { key: 'archived', status: TicketStatus.CLOSED, type: TicketType.MODIFICATION, priority: Priority.LOW, finalPriority: Priority.LOW, archived: true, closureNotes: 'أُغلق وأُرشف.', titleAr: 'طلب قديم مؤرشف' },
    { key: 'overdue-scheduled', status: TicketStatus.SCHEDULED, type: TicketType.MODIFICATION, priority: Priority.CRITICAL, finalPriority: Priority.CRITICAL, assign: true, assignP13: true, overdueDays: -4, titleAr: 'تعديل قالب الفاتورة الضريبية (متأخر)' },
  ];
}

function compactTicketSpecs(): TicketSpec[] {
  return fullTicketSpecs().filter((s) =>
    ['draft', 'new', 'in-progress', 'testing', 'completed', 'closed', 'archived', 'overdue-scheduled'].includes(s.key),
  );
}

function statusTrail(status: TicketStatus, assigned: boolean): TicketStatus[] {
  const trail: TicketStatus[] = [TicketStatus.DRAFT];
  if (status === TicketStatus.DRAFT) return trail;
  trail.push(TicketStatus.NEW);
  const early = new Set<TicketStatus>([
    TicketStatus.NEW,
    TicketStatus.AWAITING_INFO,
    TicketStatus.AWAITING_APPROVAL,
    TicketStatus.REJECTED,
    TicketStatus.ON_HOLD,
  ]);
  if (early.has(status)) {
    if (status !== TicketStatus.NEW) trail.push(status);
    return trail;
  }
  trail.push(TicketStatus.APPROVED);
  if (status === TicketStatus.APPROVED) return trail;
  if (assigned || status === TicketStatus.SCHEDULED) trail.push(TicketStatus.SCHEDULED);
  const afterStart = new Set<TicketStatus>([
    TicketStatus.IN_PROGRESS,
    TicketStatus.AWAITING_TESTING,
    TicketStatus.AWAITING_OWNER_APPROVAL,
    TicketStatus.COMPLETED,
    TicketStatus.CLOSED,
  ]);
  if (afterStart.has(status)) trail.push(TicketStatus.IN_PROGRESS);
  if (
    new Set<TicketStatus>([
      TicketStatus.AWAITING_TESTING,
      TicketStatus.AWAITING_OWNER_APPROVAL,
      TicketStatus.COMPLETED,
      TicketStatus.CLOSED,
    ]).has(status)
  ) {
    trail.push(TicketStatus.AWAITING_TESTING);
  }
  if (
    new Set<TicketStatus>([TicketStatus.AWAITING_OWNER_APPROVAL, TicketStatus.COMPLETED, TicketStatus.CLOSED]).has(status)
  ) {
    trail.push(TicketStatus.AWAITING_OWNER_APPROVAL);
  }
  if (status === TicketStatus.COMPLETED || status === TicketStatus.CLOSED) trail.push(TicketStatus.COMPLETED);
  if (status === TicketStatus.CLOSED) trail.push(TicketStatus.CLOSED);
  if (!trail.includes(status)) trail.push(status);
  return trail;
}

function pick(role: RoleKey, ...tags: string[]): SeedUser {
  for (const tag of tags) {
    const user = roster[role][tag];
    if (user) return user;
  }
  throw new Error(`No seeded ${role} among ${tags.join(', ')}`);
}

function actors(projectN: number) {
  const cTag = `c${companyOfProject(projectN)}`;
  const pTag = `p${projectN}`;
  return {
    requester: pick('ticketRequester', cTag),
    owner: pick('systemOwner', pTag, cTag),
    head: pick('programmingHead', cTag, 'all'),
    pm: pick('projectManager', cTag, 'all'),
    developer: pick('developer', cTag, 'call'),
    qa: pick('qa', cTag, 'all'),
  };
}

function changerFor(to: TicketStatus, projectN: number, creator: SeedUser): string {
  const a = actors(projectN);
  if (to === TicketStatus.NEW) return creator.id;
  if (
    to === TicketStatus.AWAITING_INFO ||
    to === TicketStatus.AWAITING_APPROVAL ||
    to === TicketStatus.APPROVED ||
    to === TicketStatus.REJECTED
  ) {
    return a.head.id;
  }
  if (to === TicketStatus.SCHEDULED || to === TicketStatus.CLOSED || to === TicketStatus.ON_HOLD) return a.pm.id;
  if (to === TicketStatus.IN_PROGRESS || to === TicketStatus.AWAITING_TESTING) return a.developer.id;
  if (to === TicketStatus.AWAITING_OWNER_APPROVAL) return a.qa.id;
  if (to === TicketStatus.COMPLETED) return a.owner.id;
  return a.head.id;
}

function homeCompanyN(scope: Scope): number {
  if (scope.kind === 'all') return 1;
  if (scope.kind === 'companies') return scope.ids[0];
  return companyOfProject(scope.ids[0]);
}

async function main() {
  await reset();
  writeUploads();

  const companies = await Promise.all(
    COMPANIES.map((n) =>
      prisma.company.create({
        data: {
          name: `Company${n}`,
          nameAr: `شركة ${n}`,
          domain: `company${n}.barmijly.local`,
          logoUrl: `/uploads/seed-logo-c${n}.png`,
        },
      }),
    ),
  );
  const companyByN = Object.fromEntries(COMPANIES.map((n, i) => [n, companies[i]])) as Record<
    number,
    (typeof companies)[number]
  >;

  const departments = await Promise.all(
    COMPANIES.map((n) =>
      prisma.department.create({
        data: { name: `Dept${n}`, nameAr: `قسم ${n}`, companyId: companyByN[n].id },
      }),
    ),
  );
  const deptByN = Object.fromEntries(COMPANIES.map((n, i) => [n, departments[i]])) as Record<
    number,
    (typeof departments)[number]
  >;

  const systems = await Promise.all(
    PROJECTS.map((n) => {
      const c = companyOfProject(n);
      return prisma.system.create({
        data: {
          name: `Project${n}`,
          nameAr: `مشروع ${n}`,
          description: `مشروع ${n} تابع لشركة ${c}`,
          companyId: companyByN[c].id,
        },
      });
    }),
  );
  const systemByN = Object.fromEntries(PROJECTS.map((n, i) => [n, systems[i]])) as Record<
    number,
    (typeof systems)[number]
  >;

  await prisma.system.create({
    data: {
      name: 'Project1Legacy',
      nameAr: 'مشروع 1 القديم',
      description: 'نظام متوقف لاختبار تفعيل/إيقاف الأنظمة',
      companyId: companyByN[1].id,
      isActive: false,
    },
  });

  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  const userCompanies: { userId: string; companyId: string }[] = [];
  const userSystems: { userId: string; systemId: string }[] = [];

  for (const spec of ROLE_MATRIX) {
    for (const tag of spec.tags) {
      const scope = SCOPE_TAGS[tag];
      const home = homeCompanyN(scope);
      const firstName = displayName(spec.label, tag);
      const lastName = lastNameFor(tag);
      const projectOnlyDeveloper = spec.key === 'developer' && scope.kind === 'projects';
      const user = await prisma.user.create({
        data: {
          email: seedEmail(`${spec.prefix}${tag}`),
          password: hash,
          firstName,
          lastName,
          role: spec.role as UserRole,
          companyId: projectOnlyDeveloper ? null : companyByN[home].id,
          departmentId: projectOnlyDeveloper ? null : deptByN[home].id,
        },
      });
      roster[spec.key][tag] = {
        id: user.id,
        email: user.email,
        firstName,
        lastName,
        role: spec.role as UserRole,
      };

      if (scope.kind === 'companies') {
        for (const n of scope.ids) {
          userCompanies.push({ userId: user.id, companyId: companyByN[n].id });
        }
      }
      if (scope.kind === 'projects') {
        for (const n of scope.ids) {
          userSystems.push({ userId: user.id, systemId: systemByN[n].id });
        }
      }
    }
  }

  const inactive = await prisma.user.create({
    data: {
      email: seedEmail('dinactive'),
      password: hash,
      firstName: 'DeveloperInactive',
      lastName: 'Company1',
      role: UserRole.DEVELOPER,
      companyId: companyByN[1].id,
      departmentId: deptByN[1].id,
      isActive: false,
    },
  });
  userCompanies.push({ userId: inactive.id, companyId: companyByN[1].id });

  await prisma.userCompany.createMany({ data: userCompanies, skipDuplicates: true });
  await prisma.userSystem.createMany({ data: userSystems, skipDuplicates: true });

  type CreatedTicket = {
    id: string;
    status: TicketStatus;
    title: string;
    ticketNumber: number;
    key: string;
    project: number;
    company: number;
    creator: SeedUser;
  };
  const created: CreatedTicket[] = [];
  const byProjectKey: Record<string, CreatedTicket> = {};
  const historyRows: Prisma.TicketStatusHistoryCreateManyInput[] = [];
  const approvalRows: Prisma.TicketApprovalCreateManyInput[] = [];
  const assignmentRows: Prisma.TicketAssignmentCreateManyInput[] = [];
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];

  const approvedStatuses = new Set<TicketStatus>([
    TicketStatus.APPROVED,
    TicketStatus.SCHEDULED,
    TicketStatus.IN_PROGRESS,
    TicketStatus.AWAITING_TESTING,
    TicketStatus.AWAITING_OWNER_APPROVAL,
    TicketStatus.COMPLETED,
    TicketStatus.CLOSED,
  ]);

  for (const n of PROJECTS) {
    const companyN = companyOfProject(n);
    const a = actors(n);
    const specs = FULL_PROJECTS.has(n) ? fullTicketSpecs() : compactTicketSpecs();

    for (const spec of specs) {
      const useP13 = spec.assignP13 && n === 1;
      const developer = spec.assign
        ? useP13
          ? pick('developer', 'p13')
          : a.developer
        : undefined;
      const deadline =
        spec.overdueDays != null ? daysFromNow(spec.overdueDays) : spec.assign ? daysFromNow(7) : undefined;
      const title = `[C${companyN}/P${n}][${spec.status}] ${spec.titleAr}`;

      const ticket = await prisma.ticket.create({
        data: {
          title,
          description: [
            RLM + `## المطلوب`,
            ``,
            `وصف تفصيلي لطلب **مشروع ${n}** في **شركة ${companyN}** — الحالة \`${spec.status}\`.`,
            ``,
            `- تنفيذ التعديل على الشاشة المحددة`,
            `- مراعاة سلامة البيانات الحالية`,
            ``,
            '```sql',
            `SELECT * FROM tickets WHERE company = 'Company${companyN}' AND project = 'Project${n}';`,
            '```',
          ].join('\n'),
          reason: `الوضع الحالي في مشروع ${n} (شركة ${companyN}) يسبب بطئاً في إنجاز المعاملات.`,
          expectedOutcome: 'إنجاز العملية من الشاشة مباشرة دون خطوات يدوية إضافية.',
          businessImpact: 'توفير وقت الموظفين وتقليل الأخطاء اليدوية في العمليات اليومية.',
          hasFinancialLoss: spec.priority === Priority.CRITICAL,
          financialLossDetails: spec.priority === Priority.CRITICAL ? 'توقف العملية يعطل التحصيل اليومي.' : null,
          status: spec.status,
          type: spec.type,
          priority: spec.priority,
          finalPriority: spec.finalPriority,
          estimatedDeadline: deadline,
          estimatedHours: developer ? 8 : null,
          difficultyLevel: developer ? 3 : null,
          needsBackend: true,
          needsFrontend: spec.type !== TicketType.API_INTEGRATION,
          needsTesting: true,
          isArchived: spec.archived ?? false,
          closureNotes: spec.closureNotes,
          coverImageUrl: spec.key === 'in-progress' ? `/uploads/seed-cover-p${n}.png` : null,
          creatorId: a.requester.id,
          systemId: systemByN[n].id,
          companyId: companyByN[companyN].id,
          systemOwnerId: a.owner.id,
        },
      });

      const row: CreatedTicket = {
        id: ticket.id,
        status: ticket.status,
        title: ticket.title,
        ticketNumber: ticket.ticketNumber,
        key: spec.key,
        project: n,
        company: companyN,
        creator: a.requester,
      };
      created.push(row);
      byProjectKey[`${n}:${spec.key}`] = row;

      const trail = statusTrail(spec.status, !!developer);
      for (let i = 1; i < trail.length; i++) {
        historyRows.push({
          ticketId: ticket.id,
          fromStatus: trail[i - 1],
          toStatus: trail[i],
          changedById: changerFor(trail[i], n, a.requester),
          createdAt: new Date(Date.now() - (trail.length - i) * 86_400_000),
        });
      }

      if (developer) {
        assignmentRows.push({
          ticketId: ticket.id,
          developerId: developer.id,
          estimatedHours: 8,
          startDate: daysFromNow(-3),
          estimatedDeadline: deadline,
          isActive: true,
        });
      }

      if (approvedStatuses.has(spec.status)) {
        approvalRows.push({
          ticketId: ticket.id,
          approverId: a.head.id,
          decision: 'APPROVED',
          notes: `معتمد للتنفيذ ضمن خطة شركة ${companyN} / مشروع ${n}.`,
        });
      }
      if (spec.status === TicketStatus.REJECTED) {
        approvalRows.push({
          ticketId: ticket.id,
          approverId: a.head.id,
          decision: 'REJECTED',
          notes: 'الطلب غير واضح ولا يرتبط بحاجة تشغيلية فعلية.',
        });
      }
      if (spec.status === TicketStatus.AWAITING_INFO) {
        approvalRows.push({
          ticketId: ticket.id,
          approverId: a.head.id,
          decision: 'NEEDS_INFO',
          notes: 'يرجى إرفاق مثال Excel للتقرير المطلوب وتحديد الفترة الزمنية.',
        });
      }

      auditRows.push({
        action: 'TICKET_CREATED',
        entity: 'Ticket',
        entityId: ticket.id,
        userId: a.requester.id,
        ticketId: ticket.id,
        newValues: { status: spec.status, title },
      });
    }
  }

  const p1Requester = pick('ticketRequester', 'p1');
  const dualTicket = await prisma.ticket.create({
    data: {
      title: '[C1/P1][NEW] تذكرة أنشأها TicketRequesterP1 على مشروع 1',
      description: 'تذكرة لاختبار أن طالب التذكرة يرى تذاكره فقط، حتى داخل نفس المشروع.',
      reason: 'التحقق من نطاق طالب التذكرة.',
      expectedOutcome: 'TicketRequesterC1 لا يراها. TicketRequesterP1 يراها.',
      businessImpact: 'لا شيء تشغيلي — بيانات اختبار صلاحيات.',
      status: TicketStatus.NEW,
      type: TicketType.MODIFICATION,
      priority: Priority.LOW,
      creatorId: p1Requester.id,
      systemId: systemByN[1].id,
      companyId: companyByN[1].id,
      systemOwnerId: pick('systemOwner', 'p1').id,
    },
  });
  created.push({
    id: dualTicket.id,
    status: dualTicket.status,
    title: dualTicket.title,
    ticketNumber: dualTicket.ticketNumber,
    key: 'requester-p1-own',
    project: 1,
    company: 1,
    creator: p1Requester,
  });

  const p1Completed = byProjectKey['1:completed'];
  const p1Closed = byProjectKey['1:closed'];
  if (p1Completed && p1Closed) {
    // A real prerequisite rather than the old untyped "related" pointer: the
    // completed ticket could not start until the closed one was done.
    await prisma.ticketDependency.upsert({
      where: {
        blockingTicketId_blockedTicketId: {
          blockingTicketId: p1Closed.id,
          blockedTicketId: p1Completed.id,
        },
      },
      create: {
        blockingTicketId: p1Closed.id,
        blockedTicketId: p1Completed.id,
        createdById: p1Completed.creator.id,
      },
      update: {},
    });
  }

  await prisma.ticketStatusHistory.createMany({ data: historyRows });
  await prisma.ticketApproval.createMany({ data: approvalRows });
  await prisma.ticketAssignment.createMany({ data: assignmentRows });
  await prisma.auditLog.createMany({ data: auditRows });

  for (const n of COMMENT_PROJECTS) {
    const inProgress = byProjectKey[`${n}:in-progress`];
    const testing = byProjectKey[`${n}:testing`];
    const a = actors(n);
    const companyN = companyOfProject(n);

    const publicDev = await prisma.ticketComment.create({
      data: {
        ticketId: inProgress.id,
        authorId: a.developer.id,
        content: `${RLM}تم تحديد سبب المشكلة، الإصلاح جاهز غداً بإذن الله. ${mention(a.requester)}`,
        visibility: CommentVisibility.PUBLIC,
        mentions: [a.requester.id],
      },
    });
    await prisma.ticketComment.create({
      data: {
        ticketId: inProgress.id,
        authorId: a.developer.id,
        content: `${RLM}ملاحظة داخلية: المشكلة ناتجة عن deadlock في جدول الفواتير. ${mention(a.head)}`,
        visibility: CommentVisibility.INTERNAL,
        mentions: [a.head.id],
      },
    });

    await prisma.ticketComment.createMany({
      data: [
        {
          ticketId: inProgress.id,
          authorId: a.requester.id,
          content: `${RLM}هل يمكن معرفة الموعد المتوقع للإنجاز؟ الوضع يعطل العمل اليومي.`,
          visibility: CommentVisibility.PUBLIC,
          mentions: [],
        },
        {
          ticketId: inProgress.id,
          authorId: a.owner.id,
          content: `${RLM}نؤكد أن التأثير على التشغيل كبير، نرجو التسريع.`,
          visibility: CommentVisibility.PUBLIC,
          mentions: [],
        },
        {
          ticketId: testing.id,
          authorId: a.developer.id,
          content: `${RLM}تم رفع التعديل على بيئة الاختبار، جاهز للمراجعة. ${mention(a.qa)}`,
          visibility: CommentVisibility.PUBLIC,
          mentions: [a.qa.id],
        },
        {
          ticketId: testing.id,
          authorId: a.qa.id,
          content: `${RLM}داخلي: لم أختبر بعد سيناريو المرفقات الكبيرة (>5MB). ${mention(a.developer)}`,
          visibility: CommentVisibility.INTERNAL,
          mentions: [a.developer.id],
        },
      ],
    });

    const taskDev = await prisma.ticketTask.create({
      data: {
        ticketId: inProgress.id,
        title: `مراجعة استعلامات مشروع ${n}`,
        description: 'تحليل خطة التنفيذ وإضافة index مناسب.',
        assignedToId: a.developer.id,
        createdById: a.pm.id,
        status: TaskStatus.IN_PROGRESS,
        dueDate: daysFromNow(1),
      },
    });
    await prisma.ticketTask.create({
      data: {
        ticketId: inProgress.id,
        title: `كتابة اختبار انحدار لمشروع ${n}`,
        assignedToId: a.qa.id,
        createdById: a.pm.id,
        status: TaskStatus.NEW,
        dueDate: daysFromNow(3),
      },
    });
    await prisma.ticketTask.create({
      data: {
        ticketId: testing.id,
        title: `اختبار رفع المرفقات — مشروع ${n}`,
        assignedToId: a.qa.id,
        createdById: a.head.id,
        status: TaskStatus.NEW,
        dueDate: daysFromNow(2),
      },
    });

    const fileSize = (name: string) => fs.statSync(path.join(uploadDir(), name)).size;

    await prisma.ticketAttachment.createMany({
      data: [
        {
          fileName: `مواصفات-شركة-${companyN}.txt`,
          fileSize: fileSize(`seed-file-c${companyN}.txt`),
          mimeType: 'text/plain',
          url: `/uploads/seed-file-c${companyN}.txt`,
          ticketId: inProgress.id,
          uploadedById: a.requester.id,
        },
        {
          fileName: `غلاف-مشروع-${n}.png`,
          fileSize: fileSize(`seed-cover-p${n}.png`),
          mimeType: 'image/png',
          url: `/uploads/seed-cover-p${n}.png`,
          ticketId: inProgress.id,
          uploadedById: a.requester.id,
        },
        {
          fileName: `تعليق-مشروع-${n}.txt`,
          fileSize: fileSize(`seed-comment-p${n}.txt`),
          mimeType: 'text/plain',
          url: `/uploads/seed-comment-p${n}.txt`,
          commentId: publicDev.id,
          ticketId: inProgress.id,
          uploadedById: a.developer.id,
        },
        {
          fileName: `مهمة-مشروع-${n}.txt`,
          fileSize: fileSize(`seed-file-c${companyN}.txt`),
          mimeType: 'text/plain',
          url: `/uploads/seed-file-c${companyN}.txt`,
          taskId: taskDev.id,
          ticketId: inProgress.id,
          uploadedById: a.pm.id,
        },
      ],
    });
  }

  const COPY: Record<NotificationType, (title: string) => { title: string; body: string }> = {
    [NotificationType.TICKET_CREATED]: (t) => ({ title: 'تذكرة جديدة تنتظر المراجعة', body: `تم تقديم التذكرة «${t}»` }),
    [NotificationType.INFO_REQUESTED]: (t) => ({ title: 'مطلوب معلومات إضافية', body: `رئيس البرمجة طلب توضيحاً على «${t}»` }),
    [NotificationType.TICKET_APPROVED]: (t) => ({ title: 'تم اعتماد التذكرة', body: `التذكرة «${t}» أصبحت معتمدة` }),
    [NotificationType.TICKET_REJECTED]: (t) => ({ title: 'تم رفض التذكرة', body: `التذكرة «${t}» رُفضت مع ملاحظات` }),
    [NotificationType.TICKET_ASSIGNED]: (t) => ({ title: 'أُسندت تذكرة لمطور', body: `أُسندت «${t}» إلى مطور المشروع` }),
    [NotificationType.STATUS_CHANGED]: (t) => ({ title: 'تغيرت حالة التذكرة', body: `تغيرت حالة «${t}»` }),
    [NotificationType.COMMENT_ADDED]: (t) => ({ title: 'تعليق جديد على تذكرة', body: `أُضيف تعليق على «${t}»` }),
    [NotificationType.DEADLINE_APPROACHING]: (t) => ({ title: 'موعد التسليم يقترب', body: `تبقى أيام على تسليم «${t}»` }),
    [NotificationType.TICKET_DELAYED]: (t) => ({ title: 'التذكرة متأخرة عن الموعد', body: `تجاوزت «${t}» تاريخ التسليم` }),
    [NotificationType.EXECUTION_COMPLETED]: (t) => ({ title: 'اكتمل تنفيذ التذكرة', body: `انتهى تنفيذ «${t}» وبانتظار الاختبار` }),
    [NotificationType.CLOSURE_APPROVAL_REQUESTED]: (t) => ({ title: 'مطلوب اعتماد الإغلاق', body: `يُرجى اعتماد إغلاق «${t}»` }),
    [NotificationType.TASK_ASSIGNED]: (t) => ({ title: 'أُسندت مهمة لمطور', body: `مهمة جديدة على «${t}»` }),
    [NotificationType.BUG_ASSIGNED]: (t) => ({ title: 'أُسند إليك خطأ', body: `خطأ جديد مرتبط بـ «${t}»` }),
    [NotificationType.TEST_CASE_FAILED]: (t) => ({ title: 'فشلت حالة اختبار', body: `فشلت حالة اختبار على «${t}»` }),
  };

  const types = Object.values(NotificationType);
  const shortTitle = (t: { title: string }) => t.title.replace(/^\[C\d+\/P\d+\]\[[A-Z_]+\]\s*/, '');
  const notificationRows: Prisma.NotificationCreateManyInput[] = [];

  const headAllTickets = created.filter((t) => !t.title.includes('مؤرشف'));
  for (let i = 0; i < 40; i++) {
    const type = types[i % types.length];
    const ticket = headAllTickets[i % headAllTickets.length];
    const copy = COPY[type](shortTitle(ticket));
    notificationRows.push({
      type,
      title: copy.title,
      body: copy.body,
      userId: roster.programmingHead.all.id,
      ticketId: ticket.id,
      isRead: i >= 32,
      createdAt: hoursAgo(i * 3),
    });
  }

  for (const n of COMMENT_PROJECTS) {
    const a = actors(n);
    const inProgress = byProjectKey[`${n}:in-progress`];
    const testing = byProjectKey[`${n}:testing`];
    const info = byProjectKey[`${n}:info`];
    const ownerApproval = byProjectKey[`${n}:owner-approval`];
    const overdue = byProjectKey[`${n}:overdue-scheduled`];
    const label = shortTitle(inProgress);

    notificationRows.push({
      type: NotificationType.TICKET_ASSIGNED,
      title: 'تم إسناد تذكرة لك',
      body: `أُسندت إليك «${label}»`,
      userId: a.developer.id,
      ticketId: inProgress.id,
      isRead: false,
      createdAt: hoursAgo(4),
    });
    notificationRows.push({
      type: NotificationType.COMMENT_ADDED,
      title: 'تعليق جديد على تذكرتك',
      body: `تعليق جديد على «${label}»`,
      userId: a.requester.id,
      ticketId: inProgress.id,
      isRead: false,
      createdAt: hoursAgo(6),
    });
    notificationRows.push({
      type: NotificationType.EXECUTION_COMPLETED,
      title: 'جاهزة للاختبار',
      body: `التذكرة «${shortTitle(testing)}» جاهزة للاختبار`,
      userId: a.qa.id,
      ticketId: testing.id,
      isRead: false,
      createdAt: hoursAgo(8),
    });
    if (info) {
      notificationRows.push({
        type: NotificationType.INFO_REQUESTED,
        title: 'مطلوب معلومات إضافية',
        body: `يرجى إرفاق مثال Excel لـ «${shortTitle(info)}»`,
        userId: a.requester.id,
        ticketId: info.id,
        isRead: false,
        createdAt: hoursAgo(12),
      });
    }
    if (ownerApproval) {
      notificationRows.push({
        type: NotificationType.CLOSURE_APPROVAL_REQUESTED,
        title: 'مطلوب اعتماد الإغلاق',
        body: `يُرجى اعتماد إغلاق «${shortTitle(ownerApproval)}»`,
        userId: a.owner.id,
        ticketId: ownerApproval.id,
        isRead: false,
        createdAt: hoursAgo(10),
      });
    }
    if (overdue) {
      notificationRows.push({
        type: NotificationType.TICKET_DELAYED,
        title: 'التذكرة متأخرة عن الموعد',
        body: `تجاوزت «${shortTitle(overdue)}» تاريخ التسليم`,
        userId: a.pm.id,
        ticketId: overdue.id,
        isRead: false,
        createdAt: hoursAgo(3),
      });
    }
  }

  await prisma.notification.createMany({ data: notificationRows });

  await prisma.ticketTemplate.createMany({
    data: [
      {
        name: 'Screen change',
        nameAr: 'تعديل شاشة',
        domain: 'erp',
        type: TicketType.MODIFICATION,
        description: 'قالب لتعديل شاشة قائمة.',
        fields: { needsFrontend: true, needsBackend: true },
      },
      {
        name: 'Bug fix',
        nameAr: 'إصلاح خطأ',
        domain: 'all',
        type: TicketType.BUG_FIX,
        description: 'قالب لإصلاح خطأ تشغيلي.',
        fields: { needsTesting: true },
      },
      {
        name: 'New report',
        nameAr: 'تقرير جديد',
        domain: 'reports',
        type: TicketType.REPORT_DASHBOARD,
        description: 'قالب لتقرير أو لوحة مؤشرات.',
        fields: { needsBackend: true },
      },
    ],
  });

  const headAll = roster.programmingHead.all;
  const pmAll = roster.projectManager.all;

  await prisma.signupRequest.createMany({
    data: [
      { firstName: 'SignupPending', lastName: 'One', email: seedEmail('signup1'), status: SignupRequestStatus.PENDING },
      { firstName: 'SignupPending', lastName: 'Two', email: seedEmail('signup2'), status: SignupRequestStatus.PENDING },
      {
        firstName: 'SignupApproved',
        lastName: 'Three',
        email: seedEmail('signup3'),
        status: SignupRequestStatus.APPROVED,
        reviewedById: headAll.id,
        reviewedAt: hoursAgo(20),
      },
      {
        firstName: 'SignupRejected',
        lastName: 'Four',
        email: seedEmail('signup4'),
        status: SignupRequestStatus.REJECTED,
        reviewedById: pmAll.id,
        reviewedAt: hoursAgo(48),
      },
    ],
  });

  const invite = async (opts: {
    plus: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: InvitationStatus;
    expiresAt: Date;
    password?: string;
  }) => {
    const user = await prisma.user.create({
      data: {
        email: seedEmail(opts.plus),
        firstName: opts.firstName,
        lastName: opts.lastName,
        role: opts.role,
        companyId: companyByN[1].id,
        ...(opts.password ? { password: opts.password } : {}),
      },
    });
    await prisma.emailInvitation.create({
      data: {
        email: user.email,
        role: opts.role,
        status: opts.status,
        expiresAt: opts.expiresAt,
        senderId: headAll.id,
        receiverId: user.id,
        companyId: companyByN[1].id,
      },
    });
  };

  await invite({
    plus: 'invpending',
    firstName: 'InvitePending',
    lastName: 'Company1',
    role: UserRole.DEVELOPER,
    status: InvitationStatus.PENDING,
    expiresAt: daysFromNow(2),
  });
  await invite({
    plus: 'invexpired',
    firstName: 'InviteExpired',
    lastName: 'Company1',
    role: UserRole.QA,
    status: InvitationStatus.EXPIRED,
    expiresAt: daysFromNow(-3),
  });
  await invite({
    plus: 'invrevoked',
    firstName: 'InviteRevoked',
    lastName: 'Company1',
    role: UserRole.TICKET_REQUESTER,
    status: InvitationStatus.REVOKED,
    expiresAt: daysFromNow(1),
  });
  await invite({
    plus: 'invaccepted',
    firstName: 'InviteAccepted',
    lastName: 'Company1',
    role: UserRole.DEVELOPER,
    status: InvitationStatus.ACCEPTED,
    expiresAt: daysFromNow(-5),
    password: hash,
  });

  const accounts = loginAccounts();
  console.log('Seed complete — company × project permission matrix');
  console.log(`  password: ${SEED_PASSWORD}`);
  console.log('  companies: Company1 … Company6');
  console.log('  projects:  Project1 … Project12 (2 per company)');
  console.log('             Company1 → Project1, Project2');
  console.log('             Company2 → Project3, Project4');
  console.log('             Company3 → Project5, Project6');
  console.log('             Company4 → Project7, Project8');
  console.log('             Company5 → Project9, Project10');
  console.log('             Company6 → Project11, Project12');
  console.log('             + Project1Legacy (inactive) on Company1');
  console.log(`  tickets:   ${created.length}`);
  console.log('');
  console.log('  How to read a name:');
  console.log('    DeveloperC1           → Company1 (Project1 + Project2)');
  console.log('    DeveloperP1           → Project1 only (must NOT see Project2)');
  console.log('    DeveloperP13          → Project1 + Project3 (cross-company)');
  console.log('    ProjectManagerC12     → Company1 + Company2');
  console.log('    ProjectManagerC456    → Company4 + Company5 + Company6');
  console.log('    ProgrammingHeadAll    → org-wide (no grants)');
  console.log('');
  console.log('  Logins (plus-alias → Gmail):');
  const width = Math.max(...accounts.map((a) => a.label.length));
  for (const a of accounts) {
    console.log(`    ${a.label.padEnd(width)}  ${a.email.padEnd(44)}  ${a.note}`);
  }
  console.log(`    ${'DeveloperInactive'.padEnd(width)}  ${seedEmail('dinactive').padEnd(44)}  Company1, isActive=false`);
  console.log('');
  console.log('  Expected visibility:');
  console.log('    *C1   sees Company1 tickets (both projects), not Company2–6');
  console.log('    *P1   sees Project1 only — not Project2 in the same company');
  console.log('    *P13  sees Project1 + Project3, not Project2 / Project4');
  console.log('    *C123 sees Company1–3, not Company4–6');
  console.log('    *C456 sees Company4–6, not Company1–3');
  console.log('    *All  sees every company and project');
  console.log('    TicketRequester* sees only tickets they created (internal comments hidden)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
