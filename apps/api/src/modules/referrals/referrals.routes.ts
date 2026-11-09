import { Router } from 'express';
import { created, ctx, ok } from '../../lib/http.js';
import { IdParam, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import { CreateReferralBody, ListReferralsQuery } from './referrals.schema.js';
import * as service from './referrals.service.js';

export const referralsRouter = Router();

referralsRouter.post(
  '/requests/:id/referrals',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    created(res, await service.create(ctx(req), id, parse(CreateReferralBody, req.body)));
  },
);

referralsRouter.get('/requests/:id/referrals', authenticate, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.listForRequest(ctx(req), id));
});

referralsRouter.get(
  '/referrals/mine',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const query = parse(ListReferralsQuery, req.query);
    ok(res, await service.listMine(ctx(req), query));
  },
);

referralsRouter.post(
  '/referrals/:id/accept',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    ok(res, await service.respond(ctx(req), id, 'accepted'));
  },
);

referralsRouter.post(
  '/referrals/:id/decline',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    ok(res, await service.respond(ctx(req), id, 'declined'));
  },
);

referralsRouter.post(
  '/referrals/:id/complete',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    ok(res, await service.complete(ctx(req), id));
  },
);
