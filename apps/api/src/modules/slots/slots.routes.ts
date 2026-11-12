import { Router } from 'express';
import { z } from 'zod';
import { ctx, ok } from '../../lib/http.js';
import { IdParam, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import { SetSchedulesBody } from './slots.schema.js';
import * as service from './slots.service.js';

/** Opening hours per centre. (Pre-generated slots were retired: free times are computed.) */
export const slotsRouter = Router();

const CentreIdParam = z.object({ centreId: z.coerce.number().int().positive() });

slotsRouter.get('/providers/:id/schedules', async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.listSchedules(id));
});

slotsRouter.get('/providers/:id/centres/:centreId/schedules', async (req, res) => {
  const { centreId } = parse(CentreIdParam, req.params);
  ok(res, await service.listSchedulesByCentre(centreId));
});

slotsRouter.put(
  '/providers/:id/schedules',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    ok(res, await service.setSchedules(ctx(req), id, parse(SetSchedulesBody, req.body)));
  },
);
