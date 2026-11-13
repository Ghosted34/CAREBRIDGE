import nodemailer from 'nodemailer';
import { z } from 'zod';
import { defineProvider, ProviderError } from './types.js';

/** Email through any SMTP server (Gmail Workspace, Zoho, Mailgun SMTP, SES SMTP endpoint, …). */
export const smtp = defineProvider({
  channel: 'email',
  description: 'Email via an SMTP server',
  config: z.object({
    SMTP_URL: z.string().regex(/^smtps?:\/\//, 'SMTP_URL must start with smtp:// or smtps://'),
    EMAIL_FROM: z.string().min(3).default('OnDiGoH <no-reply@carebridge.local>'),
  }),
  create(config) {
    const transport = nodemailer.createTransport(config.SMTP_URL);
    return {
      name: 'smtp',
      channel: 'email',
      async send(msg) {
        try {
          const info = await transport.sendMail({
            from: config.EMAIL_FROM,
            to: msg.to,
            subject: msg.subject,
            text: msg.text,
          });
          return { providerMessageId: info.messageId };
        } catch (err) {
          // 5xx SMTP replies (e.g. 550 mailbox unavailable) are permanent; everything else may pass later.
          const code = (err as { responseCode?: number }).responseCode;
          throw new ProviderError(
            err instanceof Error ? err.message : String(err),
            !(code && code >= 500),
            code,
          );
        }
      },
    };
  },
});
