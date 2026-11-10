import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { ctx, list, ok } from '../../lib/http.js';
import { IdParam, Pagination, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import {
  AddCentreCaregiverBody,
  CentreScheduleQuery,
  CreateCentreBody,
  GenerateCentreSlotsBody,
  SetCentreSchedulesBody,
  UpdateCentreBody,
  AddTeamMemberBody,
  SearchStaffQuery,
} from './providers.schema.js';
import { CreateSlotBody } from '../slots/slots.schema.js';
import * as repo from './providers.repo.js';
import * as service from './providers.service.js';

export const providersRouter = Router();

const TeamMemberParams = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

const CentreParams = z.object({
  id: IdParam.shape.id,
  centreId: IdParam.shape.id,
});

const DirectoryQuery = Pagination.extend({
  specialty: z.string().trim().min(2).max(100).default('dentistry'),
  city: z.string().trim().min(2).max(100).default('Lagos'),
});

// Public, read-only, no business rules → routes may call the repo directly (see docs/CONVENTIONS.md).
providersRouter.get('/providers', async (req, res) => {
  const q = parse(DirectoryQuery, req.query);
  list(res, await repo.listVerified(pool, q), q);
});

providersRouter.get('/providers/:id', async (req, res) => {
  const { id } = parse(IdParam, req.params);
  const provider = await repo.findVerified(pool, id);
  if (!provider) throw AppError.notFound('Provider');
  ok(res, provider);
});

// ---- operating centres (public listing; staff write) ----

providersRouter.get('/providers/:id/centres', async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.listCentres(id));
});

providersRouter.get('/providers/:id/centres/:centreId', async (req, res) => {
  const { centreId } = parse(CentreParams, req.params);
  ok(res, await service.getCentre(centreId));
});

providersRouter.get('/providers/:id/centres/:centreId/schedules', async (req, res) => {
  const { id, centreId } = parse(CentreParams, req.params);
  const centre = await repo.findCentre(pool, centreId);
  if (!centre || centre.provider_id !== id) throw AppError.notFound('Operating centre');
  ok(res, await service.listCentreSchedules(centreId));
});

providersRouter.get('/providers/:id/centres/:centreId/slots', async (req, res) => {
  const { id, centreId } = parse(CentreParams, req.params);
  const query = parse(CentreScheduleQuery, req.query);
  const centre = await repo.findCentre(pool, centreId);
  if (!centre || centre.provider_id !== id) throw AppError.notFound('Operating centre');
  ok(res, await service.listCentreSlots(centreId, query));
});

// Staff write: owner/scheduler of the provider (operators and admins pass through).
providersRouter.post(
  '/providers/:id/centres',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    ok(res, await service.addCentre(ctx(req), id, parse(CreateCentreBody, req.body)));
  },
);

providersRouter.put(
  '/providers/:id/centres/:centreId',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { centreId } = parse(CentreParams, req.params);
    ok(res, await service.changeCentre(ctx(req), centreId, parse(UpdateCentreBody, req.body)));
  },
);

providersRouter.put(
  '/providers/:id/centres/:centreId/schedules',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id, centreId } = parse(CentreParams, req.params);
    ok(
      res,
      await service.setCentreSchedules(
        ctx(req),
        id,
        centreId,
        parse(SetCentreSchedulesBody, req.body),
      ),
    );
  },
);

providersRouter.post(
  '/providers/:id/centres/:centreId/slots',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id, centreId } = parse(CentreParams, req.params);
    ok(
      res,
      await service.createCentreSlot(ctx(req), id, centreId, parse(CreateSlotBody, req.body)),
    );
  },
);

providersRouter.post(
  '/providers/:id/centres/:centreId/slots/generate',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id, centreId } = parse(CentreParams, req.params);
    ok(
      res,
      await service.generateCentreSlots(
        ctx(req),
        id,
        centreId,
        parse(GenerateCentreSlotsBody, req.body),
      ),
    );
  },
);

providersRouter.get('/providers/:id/centres/:centreId/caregivers', async (req, res) => {
  const { centreId } = parse(z.object({ centreId: IdParam.shape.id }), req.params);
  ok(res, await service.listCentreCaregivers(centreId));
});

providersRouter.post(
  '/providers/:id/centres/:centreId/caregivers',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id, centreId } = parse(CentreParams, req.params);
    ok(
      res,
      await service.addCentreCaregiver(
        ctx(req),
        id,
        centreId,
        parse(AddCentreCaregiverBody, req.body),
      ),
    );
  },
);

// ---- clinic team: managed by the clinic owner once the facility is verified ----

providersRouter.get(
  '/providers/:id/team',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    ok(res, await service.listTeam(ctx(req), parse(IdParam, req.params).id));
  },
);

providersRouter.post(
  '/providers/:id/team',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    ok(
      res,
      await service.addTeamMember(
        ctx(req),
        parse(IdParam, req.params).id,
        parse(AddTeamMemberBody, req.body),
      ),
    );
  },
);

providersRouter.delete(
  '/providers/:id/team/:userId',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id, userId } = parse(TeamMemberParams, req.params);
    ok(res, await service.removeTeamMember(ctx(req), id, userId));
  },
);

/** Provider-staff accounts a clinic owner may invite (contact details only). */
providersRouter.get(
  '/staff-accounts',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const q = parse(SearchStaffQuery, req.query);
    list(res, await service.searchStaff(ctx(req), q), q);
  },
);
