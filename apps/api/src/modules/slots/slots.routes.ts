import { Router } from 'express';
import { created, ctx, ok } from '../../lib/http.js';
import { IdParam, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import {
  CreateSlotBody,
  GenerateSlotsBody,
  ListSlotsQuery,
  SetSchedulesBody,
} from './slots.schema.js';
import * as service from './slots.service.js';

export const slotsRouter = Router();

slotsRouter.get('/providers/:id/schedules', async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.listSchedules(id));
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

slotsRouter.get('/providers/:id/slots', async (req, res) => {
  const { id } = parse(IdParam, req.params);
  const query = parse(ListSlotsQuery, req.query);
  ok(res, await service.listSlots(id, query));
});

slotsRouter.post(
  '/providers/:id/slots',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    created(res, await service.createSlot(ctx(req), id, parse(CreateSlotBody, req.body)));
  },
);

slotsRouter.post(
  '/providers/:id/slots/generate',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    created(res, await service.generateSlots(ctx(req), id, parse(GenerateSlotsBody, req.body)));
  },
);

slotsRouter.post(
  '/slots/:id/cancel',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    ok(res, await service.cancelSlot(ctx(req), id));
  },
);
