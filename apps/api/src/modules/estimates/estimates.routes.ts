import { Router } from 'express';
import { created, ctx, ok } from '../../lib/http.js';
import { IdParam, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import { CreateEstimateBody } from './estimates.schema.js';
import * as service from './estimates.service.js';

export const estimatesRouter = Router();

estimatesRouter.post(
  '/requests/:id/estimates',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    created(res, await service.create(ctx(req), id, parse(CreateEstimateBody, req.body)));
  },
);

estimatesRouter.get('/requests/:id/estimates', authenticate, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.listForRequest(ctx(req), id));
});

estimatesRouter.post('/estimates/:id/accept', authenticate, allow('patient'), async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.respond(ctx(req), id, 'accepted'));
});

estimatesRouter.post('/estimates/:id/reject', authenticate, allow('patient'), async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.respond(ctx(req), id, 'rejected'));
});
