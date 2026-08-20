import { EmailService } from '../src/email/email.service';

const noop = () => Promise.resolve();

/** No-op mailer so e2e never hits SMTP, even if .env has real credentials. */
export const silentMail: Pick<
  EmailService,
  | 'sendInvitation'
  | 'sendPasswordReset'
  | 'sendMentionEmail'
  | 'sendTicketAssigned'
  | 'sendTaskAssigned'
  | 'sendStatusUpdate'
  | 'sendDailyDigest'
> = {
  sendInvitation: noop,
  sendPasswordReset: noop,
  sendMentionEmail: noop,
  sendTicketAssigned: noop,
  sendTaskAssigned: noop,
  sendStatusUpdate: noop,
  sendDailyDigest: noop,
};
