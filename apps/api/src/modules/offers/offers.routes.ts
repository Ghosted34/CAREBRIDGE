import { Router } from 'express';
import { created, ctx, list, ok } from '../../lib/http.js';
import { IdParam, Pagination, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import { CreateOfferBody } from './offers.schema.js';
import * as service from './offers.service.js';

export const offersRouter = Router();

offersRouter.post(
  '/requests/:id/offers',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    created(res, await service.create(ctx(req), id, parse(CreateOfferBody, req.body)));
  },
);

offersRouter.get('/requests/:id/offers', authenticate, async (req, res) => {
  ok(res, await service.listForRequest(ctx(req), parse(IdParam, req.params).id));
});

offersRouter.post('/offers/:id/accept', authenticate, allow('patient'), async (req, res) => {
  ok(res, await service.respond(ctx(req), parse(IdParam, req.params).id, 'accepted'));
});

offersRouter.post('/offers/:id/decline', authenticate, allow('patient'), async (req, res) => {
  ok(res, await service.respond(ctx(req), parse(IdParam, req.params).id, 'declined'));
});

offersRouter.post(
  '/offers/:id/withdraw',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    ok(res, await service.withdraw(ctx(req), parse(IdParam, req.params).id));
  },
);

offersRouter.get(
  '/offers/mine',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const page = parse(Pagination, req.query);
    list(res, await service.listMine(ctx(req), page), page);
  },
);
