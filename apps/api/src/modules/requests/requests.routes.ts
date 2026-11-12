import { Router } from 'express';
import { ctx, list, ok } from '../../lib/http.js';
import { IdParam, Pagination, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import * as service from './requests.service.js';

/** Visits are created by booking (POST /appointments); these routes read and cancel them. */
export const requestsRouter = Router();

requestsRouter.get('/requests/mine', authenticate, allow('patient'), async (req, res) => {
  const page = parse(Pagination, req.query);
  list(res, await service.listMine(ctx(req), page), page);
});

requestsRouter.get('/requests/:id', authenticate, async (req, res) => {
  ok(res, await service.get(ctx(req), parse(IdParam, req.params).id));
});

requestsRouter.post(
  '/requests/:id/cancel',
  authenticate,
  allow('patient', 'operator', 'admin'),
  async (req, res) => {
    ok(res, await service.cancel(ctx(req), parse(IdParam, req.params).id));
  },
);
