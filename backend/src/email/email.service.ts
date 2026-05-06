import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('MAIL_HOST'),
      port: config.get<number>('MAIL_PORT'),
      secure: false,
      auth: {
        user: config.get('MAIL_USER'),
        pass: config.get('MAIL_PASS'),
      },
    });
  }

  async sendInvitation(to: string, token: string, role: string, frontendUrl: string) {
    const link = `${frontendUrl}/accept-invitation?token=${token}`;
    await this.send(to, 'You have been invited to Barmijli', `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>مرحباً بك في برمجلي</h2>
        <p>لقد تمت دعوتك للانضمام إلى نظام إدارة التذاكر <strong>برمجلي</strong> بدور <strong>${role}</strong>.</p>
        <p>يرجى الضغط على الرابط التالي لإعداد كلمة المرور والانضمام:</p>
        <a href="${link}" style="
          display: inline-block; padding: 12px 24px; background: #4F46E5;
          color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;
        ">قبول الدعوة</a>
        <p style="color: #666; font-size: 12px;">الرابط صالح لمدة 48 ساعة.</p>
      </div>
    `);
  }

  async sendStatusUpdate(to: string, ticketTitle: string, status: string, ticketUrl: string) {
    await this.send(to, `تحديث حالة التذكرة: ${ticketTitle}`, `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>تحديث التذكرة</h2>
        <p>تم تحديث حالة التذكرة <strong>${ticketTitle}</strong> إلى: <strong>${status}</strong></p>
        <a href="${ticketUrl}" style="
          display: inline-block; padding: 12px 24px; background: #4F46E5;
          color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;
        ">عرض التذكرة</a>
      </div>
    `);
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM'),
        to,
        subject,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
    }
  }
}
