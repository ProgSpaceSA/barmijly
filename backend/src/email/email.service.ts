import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  DEFAULT_DIGEST_TIMEZONE,
  DIGEST_DUE_SOON_DAYS,
  DigestTaskRef, DigestTicketRef, UserDigest,
} from '../digest/digest.types';

const STATUS_LABELS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  NEW: 'جديدة',
  AWAITING_INFO: 'بانتظار معلومات',
  AWAITING_APPROVAL: 'بانتظار الاعتماد',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
  SCHEDULED: 'مجدولة',
  IN_PROGRESS: 'قيد التنفيذ',
  AWAITING_TESTING: 'بانتظار اختبار',
  AWAITING_OWNER_APPROVAL: 'بانتظار اعتماد المالك',
  COMPLETED: 'مكتملة',
  CLOSED: 'مغلقة',
  ON_HOLD: 'معلقة',
};

const PRIORITY_LABELS_AR: Record<string, string> = {
  CRITICAL: 'حرجة',
  HIGH: 'عالية',
  MEDIUM: 'متوسطة',
  LOW: 'منخفضة',
  DEFERRED: 'مؤجلة',
};

const ROLE_LABELS_AR: Record<string, string> = {
  TICKET_REQUESTER: 'طالب التذكرة',
  SYSTEM_OWNER: 'مالك النظام',
  PROGRAMMING_HEAD: 'رئيس قسم البرمجة',
  PROJECT_MANAGER: 'مدير المشروع',
  DEVELOPER: 'مطور',
  QA: 'مختبر الجودة',
  SENIOR_MANAGEMENT: 'الإدارة العليا',
};

const DIGEST_ACCENT = {
  action: '#4338CA',
  unread: '#6366F1',
  mention: '#8B5CF6',
  task: '#0EA5E9',
  overdue: '#DC2626',
  dueSoon: '#F59E0B',
} as const;

type DigestAccent = (typeof DIGEST_ACCENT)[keyof typeof DIGEST_ACCENT];

/** Live mailbox only — preview plus-addresses are not included. */
const PERSONAL_QUOTE_EMAILS = new Set([
  'a.aldughairi@sanam-holding.com',
  'aldughairi@gmail.com',
]);

const PERSONAL_QUOTE_AR = 'لأنك مختلف، أنت تقود.';
const PERSONAL_QUOTE_EN = 'Because you are different, you lead.';

const DIGEST_ACCENT_TINT: Record<DigestAccent, { bg: string; fg: string }> = {
  '#4338CA': { bg: '#eef2ff', fg: '#4338CA' },
  '#6366F1': { bg: '#eef2ff', fg: '#6366F1' },
  '#8B5CF6': { bg: '#f5f3ff', fg: '#7C3AED' },
  '#0EA5E9': { bg: '#e0f2fe', fg: '#0284C7' },
  '#DC2626': { bg: '#fef2f2', fg: '#DC2626' },
  '#F59E0B': { bg: '#fffbeb', fg: '#D97706' },
};

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {
    const user = config.get<string>('MAIL_USER');
    const pass = config.get<string>('MAIL_PASS');

    this.transporter = nodemailer.createTransport({
      host: config.get('MAIL_HOST'),
      port: config.get<number>('MAIL_PORT'),
      secure: false,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  async sendInvitation(to: string, token: string, role: string, frontendUrl: string) {
    const link = `${frontendUrl}/accept-invitation?token=${token}`;
    await this.send(to, 'دعوة للانضمام إلى برمجلي', `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #4338CA; color: white; padding: 12px 24px; border-radius: 8px; font-size: 20px; font-weight: bold;">برمجلي</div>
        </div>
        <h2 style="color: #1e293b;">مرحباً بك في برمجلي</h2>
        <p style="color: #475569;">لقد تمت دعوتك للانضمام إلى نظام إدارة طلبات البرمجة <strong>برمجلي</strong> بدور <strong>${ROLE_LABELS_AR[role] || role}</strong>.</p>
        <p style="color: #475569;">اضغط على الزر أدناه لإعداد كلمة المرور والبدء:</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${link}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #4338CA, #6366F1); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">قبول الدعوة</a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; text-align: center;">الرابط صالح لمدة 48 ساعة · إذا لم تطلب هذه الدعوة فتجاهل هذا البريد.</p>
      </div>
    `);
  }

  async sendPasswordReset(to: string, firstName: string, token: string, frontendUrl: string) {
    const link = `${frontendUrl}/reset-password?token=${token}`;
    await this.send(to, "إعادة تعيين كلمة المرور - برمجلي", `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #4338CA; color: white; padding: 12px 24px; border-radius: 8px; font-size: 20px; font-weight: bold;">برمجلي</div>
        </div>
        <h2 style="color: #1e293b;">مرحباً ${firstName}،</h2>
        <p style="color: #475569;">تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>
        <p style="color: #475569;">اضغط على الزر أدناه لإنشاء كلمة مرور جديدة:</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${link}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #4338CA, #6366F1); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">إعادة تعيين كلمة المرور</a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; text-align: center;">الرابط صالح لمدة 30 دقيقة فقط · إذا لم تطلب هذا فتجاهل البريد.</p>
      </div>
    `);
  }

  async sendMentionEmail(to: string, mentionerName: string, ticketTitle: string, ticketUrl: string) {
    await this.send(to, `تم ذكرك في تذكرة: ${ticketTitle}`, `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #4338CA; color: white; padding: 12px 24px; border-radius: 8px; font-size: 20px; font-weight: bold;">برمجلي</div>
        </div>
        <h2 style="color: #1e293b;">تم ذكرك في تعليق</h2>
        <p style="color: #475569;">قام <strong>${mentionerName}</strong> بذكرك في تعليق على التذكرة: <strong>${ticketTitle}</strong></p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${ticketUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #4338CA, #6366F1); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">عرض التذكرة</a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; text-align: center;">برمجلي · نظام إدارة طلبات البرمجة</p>
      </div>
    `);
  }

  async sendTicketAssigned(to: string, devFirstName: string, ticketTitle: string, ticketUrl: string, assignerName: string) {
    await this.send(to, `تم إسناد تذكرة إليك: ${ticketTitle}`, `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #4338CA; color: white; padding: 12px 24px; border-radius: 8px; font-size: 20px; font-weight: bold;">برمجلي</div>
        </div>
        <h2 style="color: #1e293b;">مرحباً ${devFirstName}،</h2>
        <p style="color: #475569;">قام <strong>${assignerName}</strong> بإسناد التذكرة التالية إليك:</p>
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
          <p style="margin: 0; font-size: 15px; font-weight: bold; color: #1e293b;">${ticketTitle}</p>
        </div>
        <p style="color: #475569;">يُرجى فتح التذكرة ومراجعة تفاصيلها، ثم البدء بالعمل عليها في أقرب وقت ممكن.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${ticketUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #4338CA, #6366F1); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">عرض التذكرة</a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; text-align: center;">برمجلي · نظام إدارة طلبات البرمجة</p>
      </div>
    `);
  }

  async sendTaskAssigned(to: string, devFirstName: string, taskTitle: string, ticketTitle: string, ticketUrl: string, assignerName: string) {
    await this.send(to, `مهمة جديدة: ${taskTitle}`, `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #4338CA; color: white; padding: 12px 24px; border-radius: 8px; font-size: 20px; font-weight: bold;">برمجلي</div>
        </div>
        <h2 style="color: #1e293b;">مرحباً ${devFirstName}،</h2>
        <p style="color: #475569;">كلّفك <strong>${assignerName}</strong> بمهمة جديدة ضمن التذكرة التالية:</p>
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
          <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">التذكرة</p>
          <p style="margin: 0 0 12px; font-size: 14px; color: #475569;">${ticketTitle}</p>
          <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">المهمة</p>
          <p style="margin: 0; font-size: 15px; font-weight: bold; color: #1e293b;">${taskTitle}</p>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${ticketUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #4338CA, #6366F1); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">فتح التذكرة</a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; text-align: center;">برمجلي · نظام إدارة طلبات البرمجة</p>
      </div>
    `);
  }

  async sendStatusUpdate(to: string, ticketTitle: string, status: string, ticketUrl: string) {
    const statusLabel = this.statusLabelAr(status);
    await this.send(to, `تحديث التذكرة: ${ticketTitle}`, `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <h2 style="color: #1e293b;">تحديث حالة التذكرة</h2>
        <p style="color: #475569;">تم تحديث حالة التذكرة <strong>${this.escapeHtml(ticketTitle)}</strong> إلى: <strong>${this.escapeHtml(statusLabel)}</strong></p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${ticketUrl}" style="display: inline-block; padding: 12px 28px; background: #4338CA; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">عرض التذكرة</a>
        </div>
      </div>
    `);
  }

  async sendDailyDigest(to: string, digest: UserDigest) {
    const timeZone = this.config.get<string>('DAILY_DIGEST_TIMEZONE') || DEFAULT_DIGEST_TIMEZONE;
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://barmijly.ai';
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const dateLabel = this.formatDigestDate(new Date(), timeZone);
    const remainder = 'افتح لوحة التحكم لعرض الكل';

    const actionTotal = digest.actionTotal || digest.actionGroups.reduce((sum, g) => sum + g.total, 0);
    const stats = [
      { label: 'بانتظار إجراءك', value: actionTotal, accent: DIGEST_ACCENT.action },
      { label: 'تعليقات غير مقروءة', value: digest.unreadTotal, accent: DIGEST_ACCENT.unread },
      { label: 'إشارات إليك', value: digest.mentions.length, accent: DIGEST_ACCENT.mention },
      { label: 'مهام مفتوحة', value: digest.openTasks.length, accent: DIGEST_ACCENT.task },
      { label: 'متأخرة', value: digest.overdueTotal, accent: DIGEST_ACCENT.overdue },
      { label: 'مواعيد قريبة', value: digest.dueSoonTotal, accent: DIGEST_ACCENT.dueSoon },
    ].filter((s) => s.value > 0);

    const sections = [
      ...digest.actionGroups.map((group) =>
        this.digestSection(
          `${this.escapeHtml(group.label)} (${group.tickets.length})`,
          DIGEST_ACCENT.action,
          group.tickets.map((t) => this.digestTicketRow(t, timeZone, DIGEST_ACCENT.action)).join(''),
          group.total > group.tickets.length
            ? `و${group.total - group.tickets.length} تذكرة أخرى — ${remainder}`
            : undefined,
        ),
      ),
      digest.mentions.length
        ? this.digestSection(
            `تمت الإشارة إليك (${digest.mentions.length})`,
            DIGEST_ACCENT.mention,
            digest.mentions
              .map((m) =>
                this.digestCard(
                  DIGEST_ACCENT.mention,
                  `
          ${this.digestTicketHeading(m.ticket, DIGEST_ACCENT.mention)}
          <p style="margin: 6px 0 0; color: #64748b; font-size: 13px;">${this.escapeHtml(m.authorName)}: ${this.escapeHtml(m.excerpt)}</p>`,
                ),
              )
              .join(''),
          )
        : '',
      digest.unreadThreads.length
        ? this.digestSection(
            `تعليقات لم تقرأها (${digest.unreadTotal})`,
            DIGEST_ACCENT.unread,
            digest.unreadThreads
              .map((thread) => {
                const tint = DIGEST_ACCENT_TINT[DIGEST_ACCENT.unread];
                return this.digestCard(
                  DIGEST_ACCENT.unread,
                  `
          ${this.digestTicketHeading(thread.ticket, DIGEST_ACCENT.unread)}
          <span style="display: inline-block; background: ${tint.bg}; color: ${tint.fg}; border-radius: 999px; padding: 2px 10px; font-size: 12px; margin-top: 6px;">${thread.count} تعليق جديد</span>`,
                );
              })
              .join(''),
          )
        : '',
      digest.openTasks.length
        ? this.digestSection(
            `مهامك المفتوحة (${digest.openTasks.length})`,
            DIGEST_ACCENT.task,
            digest.openTasks.map((task) => this.digestTaskRow(task, timeZone)).join(''),
          )
        : '',
      digest.overdue.length || digest.overdueTotal
        ? this.digestSection(
            `متأخرة (${digest.overdueTotal || digest.overdue.length})`,
            DIGEST_ACCENT.overdue,
            digest.overdue.map((t) => this.digestTicketRow(t, timeZone, DIGEST_ACCENT.overdue)).join(''),
            digest.overdueTotal > digest.overdue.length
              ? `لديك ${digest.overdueTotal} تذكرة متأخرة — ${remainder}`
              : undefined,
          )
        : '',
      digest.dueSoon.length
        ? this.digestSection(
            `مواعيد قريبة (${digest.dueSoon.length})`,
            DIGEST_ACCENT.dueSoon,
            digest.dueSoon.map((t) => this.digestTicketRow(t, timeZone, DIGEST_ACCENT.dueSoon)).join(''),
            digest.dueSoonTotal > digest.dueSoon.length
              ? `و${digest.dueSoonTotal - digest.dueSoon.length} تذكرة أخرى — ${remainder}`
              : undefined,
          )
        : '',
    ]
      .filter(Boolean)
      .join('');

    await this.send(to, `ملخصك اليومي في برمجلي · ${dateLabel}`, `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 640px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #4338CA; color: white; padding: 12px 24px; border-radius: 8px; font-size: 20px; font-weight: bold;">برمجلي</div>
        </div>
        <h2 style="color: #1e293b; margin: 0 0 4px;">صباح الخير ${this.escapeHtml(digest.recipient.firstName)}،</h2>
        ${this.digestPersonalQuote(to)}
        <p style="color: #64748b; margin: 0; font-size: 14px;">ملخص ${dateLabel} · أحدث النشاط خلال ${digest.windowHours} ساعة</p>
        <p style="color: #94a3b8; margin: 4px 0 0; font-size: 12px;">المواعيد القريبة تظهر حتى ${DIGEST_DUE_SOON_DAYS} أيام مقدماً</p>
        ${this.digestStatCards(stats)}
        <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0 0 8px; text-align: center;">
          لا تظهر كل التذاكر في هذا البريد — <a href="${dashboardUrl}" style="color: #4338CA; font-weight: bold; text-decoration: none;">افتح لوحة التحكم لعرض الكل</a>.
        </p>
        ${sections}
        <div style="text-align: center; margin: 32px 0 8px;">
          <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #4338CA, #6366F1); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">فتح لوحة التحكم</a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; text-align: center;">برمجلي · نظام إدارة طلبات البرمجة — تصلك هذه الرسالة في أيام العمل، وفيها أحدث النشاط فقط.</p>
      </div>
    `);
  }

  private digestPersonalQuote(to: string) {
    if (!PERSONAL_QUOTE_EMAILS.has(to.trim().toLowerCase())) return '';
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 18px 0 14px;">
          <tr>
            <td style="background: #C9A227; border-radius: 16px; padding: 2px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background: #FFFBEB; background-image: linear-gradient(180deg, #FFFDF5 0%, #FFF3C4 100%); border-radius: 14px; padding: 22px 24px; text-align: center;">
                    <p style="margin: 0 0 4px; font-family: Georgia, 'Times New Roman', serif; font-size: 40px; line-height: 1; color: #C9A227;">&ldquo;</p>
                    <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #78350F; font-size: 17px; font-style: italic; line-height: 1.85;">«${PERSONAL_QUOTE_AR}»</p>
                    <p dir="ltr" style="margin: 12px 0 0; font-family: Georgia, 'Times New Roman', serif; color: #92400E; font-size: 14px; font-style: italic; line-height: 1.7; text-align: center;">“${PERSONAL_QUOTE_EN}”</p>
                    <div style="width: 40px; height: 1px; background: #C9A227; margin: 16px auto 0;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
  }

  private digestStatCards(stats: Array<{ label: string; value: number; accent: DigestAccent }>) {
    if (stats.length === 0) return '';
    const rows: string[] = [];
    for (let i = 0; i < stats.length; i += 2) {
      const pair = stats.slice(i, i + 2);
      rows.push(`
        <tr>
          ${pair
            .map(
              (s) => `
          <td width="${pair.length === 1 ? '100%' : '50%'}" valign="top" style="padding: 4px;">
            <div style="background: white; border: 1px solid #e2e8f0; border-right: 3px solid ${s.accent}; border-radius: 10px; padding: 14px 16px;">
              <div style="color: ${s.accent}; font-size: 22px; font-weight: bold; line-height: 1;">${s.value}</div>
              <div style="color: #64748b; font-size: 13px; margin-top: 4px;">${this.escapeHtml(s.label)}</div>
            </div>
          </td>`,
            )
            .join('')}
        </tr>`);
    }
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0 16px;">${rows.join('')}</table>`;
  }

  private digestCard(accent: DigestAccent, inner: string) {
    return `
        <div style="background: white; border: 1px solid #e2e8f0; border-right: 3px solid ${accent}; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px;">
          ${inner}
        </div>`;
  }

  private digestSection(title: string, accent: string, rows: string, footnote?: string) {
    return `
      <div style="margin-top: 24px;">
        <h3 style="color: ${accent}; font-size: 15px; margin: 0 0 10px; padding-right: 10px; border-right: 4px solid ${accent};">${title}</h3>
        ${rows}
        ${footnote ? `<p style="margin: 4px 0 0; color: #94a3b8; font-size: 12px;">${this.escapeHtml(footnote)}</p>` : ''}
      </div>`;
  }

  private digestTicketRow(ticket: DigestTicketRef, timeZone: string, accent: DigestAccent) {
    const meta = [
      this.statusLabelAr(ticket.status),
      ticket.priority ? PRIORITY_LABELS_AR[ticket.priority] || ticket.priority : null,
      ticket.estimatedDeadline
        ? `الموعد: ${this.formatDigestDate(ticket.estimatedDeadline, timeZone)}`
        : null,
    ].filter(Boolean) as string[];

    return this.digestCard(
      accent,
      `
          ${this.digestTicketHeading(ticket, accent)}
          <p style="margin: 6px 0 0; color: #64748b; font-size: 12px;">${meta.map((m) => this.escapeHtml(m)).join(' · ')}</p>`,
    );
  }

  /**
   * Ticket codes are Latin (`BRM-0018`). In a `dir="rtl"` email they swap with
   * another Latin run such as `[SEED]` unless they sit in their own LTR island.
   * `user-select: all` lets a click highlight the code so it can be copied —
   * mail clients strip JavaScript, so a copy button is not possible.
   */
  private digestTicketHeading(ticket: DigestTicketRef, accent: DigestAccent) {
    return `
          <div style="margin-bottom: 4px;">${this.digestTicketCodeChip(ticket.ticketCode, accent)}</div>
          <a href="${ticket.url}" style="color: #1e293b; font-size: 14px; font-weight: bold; text-decoration: none; display: block;">${this.escapeHtml(ticket.title)}</a>`;
  }

  private digestTicketCodeChip(ticketCode: string, accent: DigestAccent = DIGEST_ACCENT.action) {
    const tint = DIGEST_ACCENT_TINT[accent];
    return `<span dir="ltr" style="unicode-bidi: isolate; user-select: all; display: inline-block; font-family: Consolas, ui-monospace, monospace; background: ${tint.bg}; color: ${tint.fg}; border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: bold;">${this.escapeHtml(ticketCode)}</span>`;
  }

  private digestTaskRow(task: DigestTaskRef, timeZone: string) {
    const due = task.dueDate
      ? `الاستحقاق: ${this.formatDigestDate(task.dueDate, timeZone)}`
      : null;

    return this.digestCard(
      DIGEST_ACCENT.task,
      `
          ${this.digestTicketHeading({ ...task.ticket, title: task.title }, DIGEST_ACCENT.task)}
          <p style="margin: 6px 0 0; color: #64748b; font-size: 12px;">${this.escapeHtml(task.ticket.title)}</p>
          ${due ? `<p style="margin: 4px 0 0; color: #64748b; font-size: 12px;">${this.escapeHtml(due)}</p>` : ''}`,
    );
  }

  private formatDigestDate(date: Date, timeZone: string) {
    try {
      return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
        timeZone,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  private statusLabelAr(status: string) {
    return STATUS_LABELS_AR[status] || status;
  }

  /** Ticket titles and comment excerpts are user input — never interpolate them raw. */
  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private mailDisabled() {
    if (process.env.MAIL_ALLOW_IN_TESTS === 'true') return false;
    if (process.env.MAIL_ENABLED === 'false') return true;
    // Jest sets this in every worker — unit, e2e, and anything else under npm test.
    return Boolean(process.env.JEST_WORKER_ID);
  }

  private async send(to: string, subject: string, html: string) {
    if (this.mailDisabled()) {
      this.logger.debug(`Skipping email in tests: ${subject} → ${to}`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: `برمجلي <${this.config.get('MAIL_FROM')}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${to}: ${message}`);
    }
  }
}
