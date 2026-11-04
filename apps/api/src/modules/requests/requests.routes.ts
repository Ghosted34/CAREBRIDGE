import { Router } from 'express';
import { created, ctx, list, ok } from '../../lib/http.js';
import { IdParam, Pagination, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import { AssignedQuery, CreateRequestBody, QueueQuery } from './requests.schema.js';
import * as service from './requests.service.js';

export const requestsRouter = Router();

requestsRouter.post('/requests', authenticate, allow('patient'), async (req, res) => {
  created(res, await service.create(ctx(req), parse(CreateRequestBody, req.body)));
});

requestsRouter.get('/requests/mine', authenticate, allow('patient'), async (req, res) => {
  const page = parse(Pagination, req.query);
  list(res, await service.listMine(ctx(req), page), page);
});

requestsRouter.get(
  '/requests/queue',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const q = parse(QueueQuery, req.query);
    list(res, await service.queue(ctx(req), q), q);
  },
);

requestsRouter.get(
  '/requests/assigned',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const q = parse(AssignedQuery, req.query);
    list(res, await service.assigned(ctx(req), q), q);
  },
);

for (const step of Object.keys(service.JOURNEY_STEPS) as service.JourneyStep[]) {
  requestsRouter.post(
    `/requests/:id/${step}`,
    authenticate,
    allow('provider_staff', 'operator', 'admin'),
    async (req, res) => {
      ok(res, await service.progress(ctx(req), parse(IdParam, req.params).id, step));
    },
  );
}

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
