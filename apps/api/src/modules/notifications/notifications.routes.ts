import { Router } from 'express';
import { z } from 'zod';
import { ctx, list, ok } from '../../lib/http.js';
import { IdParam, Pagination, parse } from '../../lib/validate.js';
import { authenticate } from '../../middleware/auth.js';
import * as service from './notifications.service.js';

export const notificationsRouter = Router();

const InboxQuery = Pagination.extend({ unread: z.stringbool().optional() });

notificationsRouter.get('/notifications', authenticate, async (req, res) => {
  const q = parse(InboxQuery, req.query);
  list(res, await service.inbox(ctx(req), q), q);
});

notificationsRouter.get('/notifications/unread-count', authenticate, async (req, res) => {
  ok(res, { count: await service.unreadCount(ctx(req)) });
});

notificationsRouter.post('/notifications/read-all', authenticate, async (req, res) => {
  ok(res, await service.markAllRead(ctx(req)));
});

notificationsRouter.post('/notifications/:id/read', authenticate, async (req, res) => {
  ok(res, await service.markRead(ctx(req), parse(IdParam, req.params).id));
});
