import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  DEFAULT_DIGEST_TIMEZONE,
  DIGEST_DUE_SOON_DAYS,
  DigestBugAlert,
  DigestTaskRef, DigestTicketRef, UserDigest,
  formatTicketCode,
} from '../digest/digest.types';
import { formatBugCode } from '../testing/test-code';

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

const ACCENT = {
  brand: '#4338CA',
  unread: '#6366F1',
  mention: '#7C3AED',
  task: '#0284C7',
  bug: '#EF4444',
  overdue: '#DC2626',
  dueSoon: '#D97706',
  success: '#059669',
  muted: '#64748B',
} as const;

type Accent = (typeof ACCENT)[keyof typeof ACCENT];

const STATUS_ACCENT: Record<string, Accent> = {
  DRAFT: ACCENT.muted,
  NEW: ACCENT.brand,
  AWAITING_INFO: ACCENT.dueSoon,
  AWAITING_APPROVAL: ACCENT.dueSoon,
  APPROVED: ACCENT.success,
  REJECTED: ACCENT.overdue,
  SCHEDULED: ACCENT.task,
  IN_PROGRESS: ACCENT.task,
  AWAITING_TESTING: ACCENT.mention,
  AWAITING_OWNER_APPROVAL: ACCENT.mention,
  COMPLETED: ACCENT.success,
  CLOSED: ACCENT.muted,
  ON_HOLD: ACCENT.dueSoon,
};

/** Same stack as the app (`globals.css`). Tahoma covers clients that drop web fonts. */
const FONT = "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif";
const FONT_MONO = "'IBM Plex Mono', Consolas, ui-monospace, monospace";
const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const SURFACE = '#F8FAFC';
const FOOTER_BRAND = 'برمجلي · نظام إدارة طلبات البرمجة';

/** Live mailbox only — preview plus-addresses are not included. */
const PERSONAL_QUOTE_EMAILS = new Set([
  'a.aldughairi@sanam-holding.com',
  'aldughairi@gmail.com',
]);

const PERSONAL_QUOTE_AR = 'لأنك مختلف، أنت تقود.';
const PERSONAL_QUOTE_EN = 'Because you are different, you lead.';

/** Company + system shown on ticket-related (and invite) mail. */
export type MailScope = {
  companyName?: string | null;
  systemName?: string | null;
  /** When set, bug mail is about this ticket — not the whole system. */
  ticketTitle?: string | null;
  ticketNumber?: number | null;
  ticketUrl?: string | null;
  /** Linking an existing bug vs filing a new one on the ticket. */
  bugLinkKind?: 'filed' | 'linked';
};

const TINT: Record<Accent, { bg: string; fg: string }> = {
  '#4338CA': { bg: '#EEF2FF', fg: '#4338CA' },
  '#6366F1': { bg: '#EEF2FF', fg: '#4F46E5' },
  '#7C3AED': { bg: '#F5F3FF', fg: '#7C3AED' },
  '#0284C7': { bg: '#E0F2FE', fg: '#0284C7' },
  '#EF4444': { bg: '#FEF2F2', fg: '#DC2626' },
  '#DC2626': { bg: '#FEF2F2', fg: '#DC2626' },
  '#D97706': { bg: '#FFFBEB', fg: '#B45309' },
  '#059669': { bg: '#ECFDF5', fg: '#047857' },
  '#64748B': { bg: '#F1F5F9', fg: '#475569' },
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

  async sendInvitation(
    to: string,
    token: string,
    role: string,
    frontendUrl: string,
    scope?: MailScope,
  ) {
    const link = `${frontendUrl}/accept-invitation?token=${token}`;
    const roleLabel = ROLE_LABELS_AR[role] || role;
    await this.send(to, 'دعوة للانضمام إلى برمجلي', this.layoutEmail({
      preheader: `دُعيت للانضمام إلى برمجلي بدور ${roleLabel}`,
      body: `
        ${this.heading('مرحباً بك')}
        ${this.bodyText('دُعيت للانضمام إلى برمجلي.')}
        ${this.metaRow('صلاحيتك', this.pill(ACCENT.brand, roleLabel))}
        ${this.scopeBlock(scope)}
      `,
      cta: { href: link, label: 'قبول الدعوة وإعداد كلمة المرور' },
      footer: 'الرابط صالح لمدة 48 ساعة. إذا لم تطلب هذه الدعوة فتجاهل الرسالة.',
    }));
  }

  async sendPasswordReset(
    to: string,
    firstName: string,
    token: string,
    frontendUrl: string,
    scope?: MailScope,
  ) {
    const link = `${frontendUrl}/reset-password?token=${token}`;
    await this.send(to, 'إعادة تعيين كلمة المرور - برمجلي', this.layoutEmail({
      preheader: 'طلب لإعادة تعيين كلمة المرور — الرابط صالح 30 دقيقة',
      body: `
        ${this.heading(`مرحباً ${this.escapeHtml(firstName)}`)}
        ${this.bodyText('اضغط الزر أدناه لإنشاء كلمة مرور جديدة لحسابك.')}
        ${this.scopeBlock(scope)}
      `,
      cta: { href: link, label: 'إعادة تعيين كلمة المرور' },
      footer: 'الرابط صالح لمدة 30 دقيقة. إذا لم تطلب هذا فتجاهل الرسالة — حسابك يبقى كما هو.',
    }));
  }

  async sendMentionEmail(
    to: string,
    mentionerName: string,
    ticketTitle: string,
    ticketUrl: string,
    ticketNumber?: number,
    scope?: MailScope,
  ) {
    await this.send(to, `تم ذكرك في تذكرة: ${ticketTitle}`, this.layoutEmail({
      preheader: `${mentionerName} أشار إليك في «${ticketTitle}»`,
      body: `
        ${this.heading('أشار إليك أحدهم')}
        ${this.bodyText(
          `<strong style="color:${INK}">${this.escapeHtml(mentionerName)}</strong> ذكرك في تعليق.`,
        )}
        ${this.ticketPanel({ title: ticketTitle, url: ticketUrl, ticketNumber, accent: ACCENT.mention, scope })}
      `,
      cta: { href: ticketUrl, label: 'فتح التذكرة' },
    }));
  }

  async sendTicketAssigned(
    to: string,
    devFirstName: string,
    ticketTitle: string,
    ticketUrl: string,
    assignerName: string,
    ticketNumber?: number,
    scope?: MailScope,
  ) {
    await this.send(to, `تم إسناد تذكرة إليك: ${ticketTitle}`, this.layoutEmail({
      preheader: `${assignerName} أسند إليك «${ticketTitle}»`,
      body: `
        ${this.heading(`مرحباً ${this.escapeHtml(devFirstName)}`)}
        ${this.bodyText(
          `<strong style="color:${INK}">${this.escapeHtml(assignerName)}</strong> أسند إليك تذكرة جديدة.`,
        )}
        ${this.ticketPanel({ title: ticketTitle, url: ticketUrl, ticketNumber, accent: ACCENT.brand, scope })}
      `,
      cta: { href: ticketUrl, label: 'فتح التذكرة' },
    }));
  }

  async sendTaskAssigned(
    to: string,
    devFirstName: string,
    taskTitle: string,
    ticketTitle: string,
    ticketUrl: string,
    assignerName: string,
    ticketNumber?: number,
    scope?: MailScope,
  ) {
    const code = ticketNumber != null ? formatTicketCode(ticketNumber) : null;
    await this.send(to, `مهمة جديدة: ${taskTitle}`, this.layoutEmail({
      preheader: `${assignerName} كلّفك بمهمة في «${ticketTitle}»`,
      body: `
        ${this.heading(`مرحباً ${this.escapeHtml(devFirstName)}`)}
        ${this.bodyText(
          `<strong style="color:${INK}">${this.escapeHtml(assignerName)}</strong> كلّفك بمهمة جديدة.`,
        )}
        ${this.panel(`
          <p style="margin:0 0 6px;font-family:${FONT};color:${MUTED};font-size:12px;font-weight:600;">المهمة</p>
          <p style="margin:0 0 18px;font-family:${FONT};color:${INK};font-size:17px;font-weight:700;line-height:1.5;">${this.escapeHtml(taskTitle)}</p>
          <p style="margin:0 0 6px;font-family:${FONT};color:${MUTED};font-size:12px;font-weight:600;">ضمن التذكرة</p>
          ${code ? `<div style="margin-bottom:8px;">${this.codeChip(code, ACCENT.task)}</div>` : ''}
          <a href="${this.escapeHtml(ticketUrl)}" style="font-family:${FONT};color:${INK};font-size:14px;font-weight:600;text-decoration:none;line-height:1.5;">${this.escapeHtml(ticketTitle)}</a>
          ${this.scopeLines(scope)}
        `)}
      `,
      cta: { href: ticketUrl, label: 'فتح التذكرة' },
    }));
  }

  async sendBugFiled(
    to: string,
    devFirstName: string,
    bugTitle: string,
    bugNumber: number,
    bugUrl: string,
    reporterName: string,
    scope?: MailScope,
  ) {
    const code = formatBugCode(bugNumber);
    const onTicket = Boolean(scope?.ticketTitle?.trim() || scope?.ticketUrl);
    const linked = scope?.bugLinkKind === 'linked';
    const ticketTitle = scope?.ticketTitle?.trim();
    const subject = linked
      ? `خطأ رُبط بتذكرتك: ${bugTitle}`
      : onTicket
        ? `خطأ على تذكرتك: ${bugTitle}`
        : `خطأ جديد: ${bugTitle}`;
    const lead = linked
      ? ticketTitle
        ? `<strong style="color:${INK}">${this.escapeHtml(reporterName)}</strong> ربط الخطأ «${this.escapeHtml(bugTitle)}» بتذكرتك «${this.escapeHtml(ticketTitle)}».`
        : `<strong style="color:${INK}">${this.escapeHtml(reporterName)}</strong> ربط الخطأ «${this.escapeHtml(bugTitle)}» بتذكرتك.`
      : onTicket
        ? ticketTitle
          ? `<strong style="color:${INK}">${this.escapeHtml(reporterName)}</strong> سجّل خطأاً جديداً على تذكرتك «${this.escapeHtml(ticketTitle)}».`
          : `<strong style="color:${INK}">${this.escapeHtml(reporterName)}</strong> سجّل خطأاً جديداً على تذكرتك.`
        : `<strong style="color:${INK}">${this.escapeHtml(reporterName)}</strong> سجّل خطأاً جديداً على مشروعك.`;
    const ctaHref = scope?.ticketUrl || bugUrl;
    const ctaLabel = onTicket ? 'فتح التذكرة' : 'عرض الخطأ';
    const preheader = linked
      ? `${reporterName} ربط «${bugTitle}» بتذكرتك`
      : onTicket
        ? `${reporterName} سجّل خطأ «${bugTitle}» على تذكرتك`
        : `${reporterName} سجّل خطأ «${bugTitle}»`;

    await this.send(to, subject, this.layoutEmail({
      preheader,
      body: `
        ${this.heading(`مرحباً ${this.escapeHtml(devFirstName)}`)}
        ${this.bodyText(lead)}
        ${this.panel(`
          <div style="margin-bottom:8px;">${this.codeChip(code, ACCENT.overdue)}</div>
          <p style="margin:0;font-family:${FONT};color:${INK};font-size:17px;font-weight:700;line-height:1.5;">${this.escapeHtml(bugTitle)}</p>
          ${ticketTitle ? `
          <p style="margin:12px 0 0;font-family:${FONT};color:${MUTED};font-size:13px;line-height:1.6;">
            <span style="font-weight:600;">التذكرة:</span>
            ${typeof scope?.ticketNumber === 'number' ? `<span style="margin-inline-start:6px;">${this.codeChip(formatTicketCode(scope.ticketNumber), ACCENT.brand)}</span> ` : ''}
            <span style="color:${INK};font-weight:600;">${this.escapeHtml(ticketTitle)}</span>
          </p>` : ''}
          ${this.scopeLines({
            companyName: scope?.companyName,
            systemName: scope?.systemName,
          })}
        `)}
      `,
      cta: { href: ctaHref, label: ctaLabel },
    }));
  }

  async sendStatusUpdate(
    to: string,
    ticketTitle: string,
    status: string,
    ticketUrl: string,
    ticketNumber?: number,
    fromStatus?: string,
    scope?: MailScope,
  ) {
    const toLabel = this.statusLabelAr(status);
    const fromLabel = fromStatus ? this.statusLabelAr(fromStatus) : undefined;
    const accent = STATUS_ACCENT[status] || ACCENT.brand;
    const fromAccent = fromStatus
      ? STATUS_ACCENT[fromStatus] || ACCENT.muted
      : ACCENT.muted;
    const changeLine = fromLabel
      ? `تم تغيير الحالة من «${fromLabel}» إلى «${toLabel}».`
      : `أصبحت الحالة «${toLabel}».`;

    await this.send(to, `${toLabel}: ${ticketTitle}`, this.layoutEmail({
      preheader: fromLabel
        ? `«${ticketTitle}» · من ${fromLabel} إلى ${toLabel}`
        : `«${ticketTitle}» أصبحت ${toLabel}`,
      body: `
        ${this.bodyText(this.escapeHtml(changeLine))}
        ${fromLabel
          ? this.statusTransition(fromLabel, toLabel, fromAccent, accent)
          : this.statusHero(toLabel, accent)}
        ${this.ticketPanel({ title: ticketTitle, url: ticketUrl, ticketNumber, accent, scope })}
      `,
      cta: { href: ticketUrl, label: 'فتح التذكرة' },
    }));
  }

  async sendDailyDigest(to: string, digest: UserDigest) {
    const timeZone = this.config.get<string>('DAILY_DIGEST_TIMEZONE') || DEFAULT_DIGEST_TIMEZONE;
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://barmijly.ai';
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const dateLabel = this.formatDigestDate(new Date(), timeZone);
    const remainder = 'افتح لوحة التحكم لعرض الكل';

    const actionTotal = digest.actionTotal || digest.actionGroups.reduce((sum, g) => sum + g.total, 0);
    const stats = [
      { label: 'بانتظار إجراءك', value: actionTotal, accent: ACCENT.brand },
      { label: 'تعليقات غير مقروءة', value: digest.unreadTotal, accent: ACCENT.unread },
      { label: 'أخطاء على تذاكرك', value: digest.bugAlertTotal || digest.bugAlerts.length, accent: ACCENT.bug },
      { label: 'إشارات إليك', value: digest.mentions.length, accent: ACCENT.mention },
      { label: 'مهام مفتوحة', value: digest.openTasks.length, accent: ACCENT.task },
      { label: 'متأخرة', value: digest.overdueTotal, accent: ACCENT.overdue },
      { label: 'مواعيد قريبة', value: digest.dueSoonTotal, accent: ACCENT.dueSoon },
    ].filter((s) => s.value > 0);

    const sections = [
      ...digest.actionGroups.map((group) =>
        this.digestSection(
          `${this.escapeHtml(group.label)} (${group.tickets.length})`,
          ACCENT.brand,
          group.tickets.map((t) => this.digestTicketRow(t, timeZone, ACCENT.brand)).join(''),
          group.total > group.tickets.length
            ? `و${group.total - group.tickets.length} تذكرة أخرى — ${remainder}`
            : undefined,
        ),
      ),
      digest.mentions.length
        ? this.digestSection(
            `تمت الإشارة إليك (${digest.mentions.length})`,
            ACCENT.mention,
            digest.mentions
              .map((m) =>
                this.digestRow(
                  ACCENT.mention,
                  `
          ${this.digestTicketHeading(m.ticket, ACCENT.mention)}
          <p style="margin:8px 0 0;font-family:${FONT};color:${MUTED};font-size:13px;line-height:1.6;">${this.escapeHtml(m.authorName)}: ${this.escapeHtml(m.excerpt)}</p>`,
                ),
              )
              .join(''),
          )
        : '',
      digest.unreadThreads.length
        ? this.digestSection(
            `تعليقات لم تقرأها (${digest.unreadTotal})`,
            ACCENT.unread,
            digest.unreadThreads
              .map((thread) =>
                this.digestRow(
                  ACCENT.unread,
                  `
          ${this.digestTicketHeading(thread.ticket, ACCENT.unread)}
          <div style="margin-top:8px;">${this.pill(ACCENT.unread, `${thread.count} تعليق جديد`)}</div>`,
                ),
              )
              .join(''),
          )
        : '',
      digest.bugAlerts.length
        ? this.digestSection(
            `أخطاء على تذاكرك (${digest.bugAlertTotal || digest.bugAlerts.length})`,
            ACCENT.bug,
            digest.bugAlerts.map((alert) => this.digestBugAlertRow(alert)).join(''),
            digest.bugAlertTotal > digest.bugAlerts.length
              ? `و${digest.bugAlertTotal - digest.bugAlerts.length} خطأ آخر — ${remainder}`
              : undefined,
          )
        : '',
      digest.openTasks.length
        ? this.digestSection(
            `مهامك المفتوحة (${digest.openTasks.length})`,
            ACCENT.task,
            digest.openTasks.map((task) => this.digestTaskRow(task, timeZone)).join(''),
          )
        : '',
      digest.overdue.length || digest.overdueTotal
        ? this.digestSection(
            `متأخرة (${digest.overdueTotal || digest.overdue.length})`,
            ACCENT.overdue,
            digest.overdue.map((t) => this.digestTicketRow(t, timeZone, ACCENT.overdue)).join(''),
            digest.overdueTotal > digest.overdue.length
              ? `لديك ${digest.overdueTotal} تذكرة متأخرة — ${remainder}`
              : undefined,
          )
        : '',
      digest.dueSoon.length
        ? this.digestSection(
            `مواعيد قريبة (${digest.dueSoon.length})`,
            ACCENT.dueSoon,
            digest.dueSoon.map((t) => this.digestTicketRow(t, timeZone, ACCENT.dueSoon)).join(''),
            digest.dueSoonTotal > digest.dueSoon.length
              ? `و${digest.dueSoonTotal - digest.dueSoon.length} تذكرة أخرى — ${remainder}`
              : undefined,
          )
        : '',
    ]
      .filter(Boolean)
      .join('');

    await this.send(to, `ملخصك اليومي في برمجلي · ${dateLabel}`, this.layoutEmail({
      preheader: `ملخص ${dateLabel} · أحدث النشاط خلال ${digest.windowHours} ساعة`,
      body: `
        ${this.heading(`صباح الخير ${this.escapeHtml(digest.recipient.firstName)}`)}
        ${this.digestPersonalQuote(to)}
        <p style="font-family:${FONT};color:${MUTED};margin:0;font-size:14px;line-height:1.7;">ملخص ${dateLabel} · أحدث النشاط خلال ${digest.windowHours} ساعة</p>
        <p style="font-family:${FONT};color:#94A3B8;margin:4px 0 0;font-size:12px;">المواعيد القريبة تظهر حتى ${DIGEST_DUE_SOON_DAYS} أيام مقدماً</p>
        ${this.digestStatCards(stats)}
        <p style="font-family:${FONT};color:${MUTED};font-size:13px;line-height:1.7;margin:4px 0 8px;text-align:center;">
          لا تظهر كل التذاكر في هذا البريد — <a href="${dashboardUrl}" style="color:${ACCENT.brand};font-weight:700;text-decoration:none;">افتح لوحة التحكم لعرض الكل</a>.
        </p>
        ${sections}
      `,
      cta: { href: dashboardUrl, label: 'فتح لوحة التحكم' },
      footer: 'تصلك هذه الرسالة في أيام العمل، وفيها أحدث النشاط فقط.',
    }));
  }

  /**
   * Shared frame: Cairo document, slim brand bar, white body, quiet footer.
   * Product tagline appears once in the footer — never again in the body.
   */
  private layoutEmail(opts: {
    preheader?: string;
    body: string;
    cta?: { href: string; label: string };
    footer?: string;
  }) {
    const preheader = opts.preheader
      ? `<div style="display:none;font-size:1px;color:#F1F5F9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${this.escapeHtml(opts.preheader)}</div>`
      : '';
    const note = opts.footer
      ? `<p style="font-family:${FONT};color:#94A3B8;font-size:12px;line-height:1.7;margin:10px 0 0;">${this.escapeHtml(opts.footer)}</p>`
      : '';

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&amp;family=IBM+Plex+Mono:wght@500;600&amp;display=swap">
</head>
<body style="margin:0;padding:0;background:#EEF2FF;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2FF;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:36px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="padding:0 8px 18px;text-align:center;">
            <div style="font-family:${FONT};color:${ACCENT.brand};font-size:20px;font-weight:700;letter-spacing:0.02em;">برمجلي</div>
          </td>
        </tr>
        <tr>
          <td dir="rtl" style="font-family:${FONT};background:#FFFFFF;border-radius:16px;padding:40px 36px 32px;border:1px solid ${LINE};box-shadow:0 1px 2px rgba(15,23,42,0.04);">
            ${opts.body}
            ${opts.cta ? this.ctaButton(opts.cta.href, opts.cta.label) : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:22px 16px 0;text-align:center;">
            <p style="font-family:${FONT};color:#94A3B8;font-size:12px;line-height:1.6;margin:0;">${FOOTER_BRAND}</p>
            ${note}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
  }

  private ctaButton(href: string, label: string) {
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px auto 0;">
          <tr>
            <td style="background:${ACCENT.brand};border-radius:12px;">
              <a href="${this.escapeHtml(href)}" style="display:inline-block;padding:14px 32px;font-family:${FONT};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;line-height:1.4;">${this.escapeHtml(label)}</a>
            </td>
          </tr>
        </table>`;
  }

  private heading(text: string) {
    return `<h1 style="font-family:${FONT};color:${INK};margin:0 0 10px;font-size:24px;font-weight:700;line-height:1.4;">${text}</h1>`;
  }

  private bodyText(innerHtml: string) {
    return `<p style="font-family:${FONT};color:${MUTED};font-size:15px;line-height:1.8;margin:0;">${innerHtml}</p>`;
  }

  /** Status is the message — one colored label, no “update update update” stack. */
  private statusHero(label: string, accent: Accent) {
    const tint = TINT[accent];
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
          <tr>
            <td style="background:${tint.bg};border-radius:999px;padding:10px 18px;">
              <span style="font-family:${FONT};color:${tint.fg};font-size:15px;font-weight:700;">${this.escapeHtml(label)}</span>
            </td>
          </tr>
        </table>`;
  }

  /** From → to pills so the change is obvious at a glance (RTL: old on the right). */
  private statusTransition(
    fromLabel: string,
    toLabel: string,
    fromAccent: Accent,
    toAccent: Accent,
  ) {
    const fromTint = TINT[fromAccent];
    const toTint = TINT[toAccent];
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
          <tr>
            <td style="background:${fromTint.bg};border-radius:999px;padding:10px 18px;vertical-align:middle;">
              <span style="font-family:${FONT};color:${fromTint.fg};font-size:14px;font-weight:700;">${this.escapeHtml(fromLabel)}</span>
            </td>
            <td style="padding:0 10px;vertical-align:middle;color:${MUTED};font-family:${FONT};font-size:16px;font-weight:700;">←</td>
            <td style="background:${toTint.bg};border-radius:999px;padding:10px 18px;vertical-align:middle;">
              <span style="font-family:${FONT};color:${toTint.fg};font-size:14px;font-weight:700;">${this.escapeHtml(toLabel)}</span>
            </td>
          </tr>
        </table>`;
  }

  private metaRow(label: string, valueHtml: string) {
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;background:${SURFACE};border:1px solid ${LINE};border-radius:12px;">
          <tr>
            <td style="padding:16px 18px;">
              <p style="margin:0 0 8px;font-family:${FONT};color:${MUTED};font-size:12px;font-weight:600;">${this.escapeHtml(label)}</p>
              ${valueHtml}
            </td>
          </tr>
        </table>`;
  }

  private pill(accent: Accent, label: string) {
    const tint = TINT[accent];
    return `<span style="display:inline-block;background:${tint.bg};color:${tint.fg};border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700;font-family:${FONT};">${this.escapeHtml(label)}</span>`;
  }

  private panel(inner: string) {
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
          <tr>
            <td style="background:${SURFACE};border:1px solid ${LINE};border-radius:12px;padding:18px 20px;font-family:${FONT};">
              ${inner}
            </td>
          </tr>
        </table>`;
  }

  private ticketPanel(opts: {
    title: string;
    url: string;
    accent: Accent;
    ticketNumber?: number;
    scope?: MailScope;
  }) {
    const code = opts.ticketNumber != null ? formatTicketCode(opts.ticketNumber) : null;
    return this.panel(`
          ${code ? `<div style="margin-bottom:10px;">${this.codeChip(code, opts.accent)}</div>` : ''}
          <a href="${this.escapeHtml(opts.url)}" style="display:block;font-family:${FONT};color:${INK};font-size:16px;font-weight:700;text-decoration:none;line-height:1.55;">${this.escapeHtml(opts.title)}</a>
          ${this.scopeLines(opts.scope)}`);
  }

  /** Standalone company/system card (invites, password reset). */
  private scopeBlock(scope?: MailScope) {
    const lines = this.scopeLines(scope);
    if (!lines) return '';
    return this.panel(lines);
  }

  /** Inline company + system under a ticket/task panel. */
  private scopeLines(scope?: MailScope) {
    const rows: Array<[string, string]> = [];
    if (scope?.companyName?.trim()) rows.push(['الشركة', scope.companyName.trim()]);
    if (scope?.systemName?.trim()) rows.push(['النظام', scope.systemName.trim()]);
    if (!rows.length) return '';
    return rows
      .map(
        ([label, value], i) => `
          <p style="margin:${i === 0 ? '12px' : '6px'} 0 0;font-family:${FONT};color:${MUTED};font-size:13px;line-height:1.6;">
            <span style="font-weight:600;">${this.escapeHtml(label)}:</span>
            <span style="color:${INK};font-weight:600;">${this.escapeHtml(value)}</span>
          </p>`,
      )
      .join('');
  }

  private codeChip(ticketCode: string, accent: Accent = ACCENT.brand) {
    const tint = TINT[accent];
    return `<span dir="ltr" style="unicode-bidi:isolate;user-select:all;display:inline-block;font-family:${FONT_MONO};background:${tint.bg};color:${tint.fg};border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;">${this.escapeHtml(ticketCode)}</span>`;
  }

  private digestPersonalQuote(to: string) {
    if (!PERSONAL_QUOTE_EMAILS.has(to.trim().toLowerCase())) return '';
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 14px;">
          <tr>
            <td style="background:#C9A227;border-radius:16px;padding:2px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#FFFBEB;background-image:linear-gradient(180deg,#FFFDF5 0%,#FFF3C4 100%);border-radius:14px;padding:22px 24px;text-align:center;">
                    <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1;color:#C9A227;">&ldquo;</p>
                    <p style="margin:0;font-family:Georgia,'Times New Roman',serif;color:#78350F;font-size:17px;font-style:italic;line-height:1.85;">«${PERSONAL_QUOTE_AR}»</p>
                    <p dir="ltr" style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;color:#92400E;font-size:14px;font-style:italic;line-height:1.7;text-align:center;">“${PERSONAL_QUOTE_EN}”</p>
                    <div style="width:40px;height:1px;background:#C9A227;margin:16px auto 0;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
  }

  private digestStatCards(stats: Array<{ label: string; value: number; accent: Accent }>) {
    if (stats.length === 0) return '';

    const card = (s: { label: string; value: number; accent: Accent }) => `
            <div style="background:${SURFACE};border:1px solid ${LINE};border-right:3px solid ${s.accent};border-radius:12px;padding:14px 16px;margin-bottom:8px;">
              <div style="font-family:${FONT};color:${s.accent};font-size:22px;font-weight:700;line-height:1;">${s.value}</div>
              <div style="font-family:${FONT};color:${MUTED};font-size:13px;margin-top:6px;line-height:1.4;">${this.escapeHtml(s.label)}</div>
            </div>`;

    if (stats.length === 1) {
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 16px;"><tr><td style="padding:4px;">${card(stats[0])}</td></tr></table>`;
    }

    if (stats.length === 3) {
      const cell = (s: { label: string; value: number; accent: Accent }) =>
        `<td width="33%" valign="top" style="padding:4px;">${card(s)}</td>`;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 16px;"><tr>${stats.map(cell).join('')}</tr></table>`;
    }

    // Two independent columns so a short label (e.g. «متأخرة») is not stretched
    // to the height of a longer neighbour in the same table row.
    const mid = Math.ceil(stats.length / 2);
    const left = stats.slice(0, mid);
    const right = stats.slice(mid);
    const column = (items: typeof stats) => items.map(card).join('');

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 16px;">
      <tr>
        <td width="50%" valign="top" style="padding:4px;">${column(left)}</td>
        <td width="50%" valign="top" style="padding:4px;">${column(right)}</td>
      </tr>
    </table>`;
  }

  private digestRow(accent: Accent, inner: string) {
    return `
        <div style="background:${SURFACE};border:1px solid ${LINE};border-right:3px solid ${accent};border-radius:12px;padding:14px 16px;margin-bottom:8px;">
          ${inner}
        </div>`;
  }

  private digestSection(title: string, accent: string, rows: string, footnote?: string) {
    return `
      <div style="margin-top:28px;">
        <h3 style="font-family:${FONT};color:${accent};font-size:14px;font-weight:700;margin:0 0 12px;padding-right:10px;border-right:3px solid ${accent};">${title}</h3>
        ${rows}
        ${footnote ? `<p style="margin:6px 0 0;font-family:${FONT};color:#94A3B8;font-size:12px;line-height:1.6;">${this.escapeHtml(footnote)}</p>` : ''}
      </div>`;
  }

  private digestTicketRow(ticket: DigestTicketRef, timeZone: string, accent: Accent) {
    const meta = [
      this.statusLabelAr(ticket.status),
      ticket.priority ? PRIORITY_LABELS_AR[ticket.priority] || ticket.priority : null,
      ticket.estimatedDeadline
        ? `الموعد: ${this.formatDigestDate(ticket.estimatedDeadline, timeZone)}`
        : null,
    ].filter(Boolean) as string[];
    const scope = [ticket.companyName, ticket.systemName].filter(Boolean) as string[];

    return this.digestRow(
      accent,
      `
          ${this.digestTicketHeading(ticket, accent)}
          ${scope.length ? `<p style="margin:6px 0 0;font-family:${FONT};color:${MUTED};font-size:12px;">${scope.map((s) => this.escapeHtml(s)).join(' · ')}</p>` : ''}
          <p style="margin:8px 0 0;font-family:${FONT};color:${MUTED};font-size:12px;">${meta.map((m) => this.escapeHtml(m)).join(' · ')}</p>`,
    );
  }

  /**
   * Ticket codes are Latin (`BRM-0018`). In a `dir="rtl"` email they swap with
   * another Latin run such as `[SEED]` unless they sit in their own LTR island.
   * `user-select: all` lets a click highlight the code so it can be copied —
   * mail clients strip JavaScript, so a copy button is not possible.
   */
  private digestTicketHeading(ticket: DigestTicketRef, accent: Accent) {
    return `
          <div style="margin-bottom:6px;">${this.codeChip(ticket.ticketCode, accent)}</div>
          <a href="${ticket.url}" style="font-family:${FONT};color:${INK};font-size:14px;font-weight:700;text-decoration:none;display:block;line-height:1.5;">${this.escapeHtml(ticket.title)}</a>`;
  }

  private digestTaskRow(task: DigestTaskRef, timeZone: string) {
    const due = task.dueDate
      ? `الاستحقاق: ${this.formatDigestDate(task.dueDate, timeZone)}`
      : null;
    const scope = [task.ticket.companyName, task.ticket.systemName].filter(Boolean) as string[];

    return this.digestRow(
      ACCENT.task,
      `
          ${this.digestTicketHeading({ ...task.ticket, title: task.title }, ACCENT.task)}
          <p style="margin:8px 0 0;font-family:${FONT};color:${MUTED};font-size:12px;">${this.escapeHtml(task.ticket.title)}</p>
          ${scope.length ? `<p style="margin:4px 0 0;font-family:${FONT};color:${MUTED};font-size:12px;">${scope.map((s) => this.escapeHtml(s)).join(' · ')}</p>` : ''}
          ${due ? `<p style="margin:4px 0 0;font-family:${FONT};color:${MUTED};font-size:12px;">${this.escapeHtml(due)}</p>` : ''}`,
    );
  }

  private digestBugAlertRow(alert: DigestBugAlert) {
    return this.digestRow(
      ACCENT.bug,
      `
          ${this.digestTicketHeading(alert.ticket, ACCENT.bug)}
          ${alert.bugCode ? `<div style="margin-top:8px;">${this.codeChip(alert.bugCode, ACCENT.bug)}</div>` : ''}
          <p style="margin:8px 0 0;font-family:${FONT};color:${MUTED};font-size:13px;line-height:1.6;">${this.escapeHtml(alert.summary)}</p>`,
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

  /** Accepts true/false/1/0/yes/no/on/off — case-insensitive (Windows .env often uses `False`). */
  private envFlag(name: string): boolean | undefined {
    const raw = process.env[name]?.trim();
    if (raw === undefined || raw === '') return undefined;
    if (/^(1|true|yes|on)$/i.test(raw)) return true;
    if (/^(0|false|no|off)$/i.test(raw)) return false;
    return undefined;
  }

  private mailDisabled() {
    if (this.envFlag('MAIL_ALLOW_IN_TESTS') === true) return false;
    if (this.envFlag('MAIL_ENABLED') === false) return true;
    // Jest sets this in every worker — unit, e2e, and anything else under npm test.
    if (process.env.JEST_WORKER_ID) return true;
    // Development / local QA: stay silent unless mail is explicitly turned on.
    if (process.env.NODE_ENV !== 'production' && this.envFlag('MAIL_ENABLED') !== true) {
      return true;
    }
    return false;
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
