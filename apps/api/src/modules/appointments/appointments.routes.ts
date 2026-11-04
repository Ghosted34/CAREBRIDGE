import { Router } from 'express';
import { created, ctx, list, ok } from '../../lib/http.js';
import { IdParam, Pagination, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import { BookAppointmentBody } from './appointments.schema.js';
import * as service from './appointments.service.js';

export const appointmentsRouter = Router();

appointmentsRouter.post('/appointments', authenticate, async (req, res) => {
  created(res, await service.book(ctx(req), parse(BookAppointmentBody, req.body)));
});

appointmentsRouter.get('/appointments/mine', authenticate, async (req, res) => {
  const page = parse(Pagination, req.query);
  list(res, await service.listMine(ctx(req), page), page);
});

for (const verb of Object.keys(service.PROVIDER_ACTIONS) as service.ProviderAction[]) {
  appointmentsRouter.post(
    `/appointments/:id/${verb}`,
    authenticate,
    allow('provider_staff', 'operator', 'admin'),
    async (req, res) => {
      ok(res, await service.providerAction(ctx(req), parse(IdParam, req.params).id, verb));
    },
  );
}

appointmentsRouter.post('/appointments/:id/cancel', authenticate, async (req, res) => {
  ok(res, await service.cancel(ctx(req), parse(IdParam, req.params).id));
});
