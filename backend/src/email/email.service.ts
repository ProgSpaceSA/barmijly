import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const ROLE_LABELS_AR: Record<string, string> = {
  TICKET_REQUESTER: 'طالب التذكرة',
  SYSTEM_OWNER: 'مالك النظام',
  PROGRAMMING_HEAD: 'رئيس قسم البرمجة',
  PROJECT_MANAGER: 'مدير المشروع',
  DEVELOPER: 'مطور',
  QA: 'مختبر الجودة',
  SENIOR_MANAGEMENT: 'الإدارة العليا',
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
    await this.send(to, `تحديث التذكرة: ${ticketTitle}`, `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <h2 style="color: #1e293b;">تحديث حالة التذكرة</h2>
        <p style="color: #475569;">تم تحديث حالة التذكرة <strong>${ticketTitle}</strong> إلى: <strong>${status}</strong></p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${ticketUrl}" style="display: inline-block; padding: 12px 28px; background: #4338CA; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">عرض التذكرة</a>
        </div>
      </div>
    `);
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: `برمجلي <${this.config.get('MAIL_FROM')}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
    }
  }
}
