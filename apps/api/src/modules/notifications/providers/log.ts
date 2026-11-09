import { z } from 'zod';
import { logger } from '../../../lib/logger.js';
import { mask } from './mask.js';
import { defineProvider, type Channel } from './types.js';

/** Development adapter: writes the message to the log instead of sending it. No settings. */
const logProvider = <C extends Channel>(channel: C) =>
  defineProvider({
    channel,
    description: 'Write messages to the log (development)',
    config: z.object({}),
    create: () => ({
      name: 'log',
      channel,
      async send(msg) {
        logger.info(
          { channel, to: mask(msg.to), subject: msg.subject, text: msg.text },
          'notification (log provider)',
        );
        return {};
      },
    }),
  });

export const logSms = logProvider('sms');
export const logEmail = logProvider('email');
