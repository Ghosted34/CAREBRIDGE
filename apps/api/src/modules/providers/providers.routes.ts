import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { ctx, list, ok } from '../../lib/http.js';
import { IdParam, Pagination, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import {
  AddTeamMemberBody,
  CreateCaregiverBody,
  CreateCentreBody,
  CreateProviderFeeBody,
  SearchStaffQuery,
  UpdateCentreBody,
  UpdateProviderFeeBody,
} from './providers.schema.js';
import * as repo from './providers.repo.js';
import * as service from './providers.service.js';

export const providersRouter = Router();

const TeamMemberParams = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

const CentreIdParams = z.object({
  id: z.coerce.number().int().positive(),
  centreId: z.coerce.number().int().positive(),
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

// ---- operating centres: managed by the clinic owner ----

providersRouter.get(
  '/providers/:id/centres',
  authenticate,
  allow('provider_staff', 'operator', 'admin', 'patient'),
  async (req, res) => {
    ok(
      res,
      await service.listCentres(
        ctx(req),
        parse(IdParam, req.params).id,
        z.coerce.number().int().positive().optional().parse(req.query.care_request_id),
      ),
    );
  },
);

providersRouter.post(
  '/providers/:id/centres',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    ok(
      res,
      await service.createCentre(
        ctx(req),
        parse(IdParam, req.params).id,
        parse(CreateCentreBody, req.body),
      ),
    );
  },
);

providersRouter.put(
  '/providers/:id/centres/:centreId',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id, centreId } = parse(CentreIdParams, req.params);
    ok(res, await service.updateCentre(ctx(req), id, centreId, parse(UpdateCentreBody, req.body)));
  },
);

// ---- caregivers: managed by the clinic owner ----

providersRouter.get(
  '/providers/:id/caregivers',
  authenticate,
  allow('provider_staff', 'operator', 'admin', 'patient'),
  async (req, res) => {
    ok(
      res,
      await service.listCaregivers(
        ctx(req),
        parse(IdParam, req.params).id,
        z.coerce.number().int().positive().optional().parse(req.query.care_request_id),
      ),
    );
  },
);

providersRouter.post(
  '/providers/:id/caregivers',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    ok(
      res,
      await service.createCaregiver(
        ctx(req),
        parse(IdParam, req.params).id,
        parse(CreateCaregiverBody, req.body),
      ),
    );
  },
);

// ---- provider fees: managed by the clinic owner ----

const FeeIdParams = z.object({
  id: z.coerce.number().int().positive(),
  feeId: z.coerce.number().int().positive(),
});

providersRouter.get(
  '/providers/:id/fees',
  authenticate,
  allow('provider_staff', 'operator', 'admin', 'patient'),
  async (req, res) => {
    ok(res, await service.listProviderFees(ctx(req), parse(IdParam, req.params).id));
  },
);

providersRouter.post(
  '/providers/:id/fees',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    ok(
      res,
      await service.setProviderFee(
        ctx(req),
        parse(IdParam, req.params).id,
        parse(CreateProviderFeeBody, req.body),
      ),
    );
  },
);

providersRouter.put(
  '/providers/:id/fees/:feeId',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id, feeId } = parse(FeeIdParams, req.params);
    ok(
      res,
      await service.updateProviderFee(
        ctx(req),
        id,
        feeId,
        parse(UpdateProviderFeeBody, req.body),
      ),
    );
  },
);

providersRouter.delete(
  '/providers/:id/fees/:feeId',
  authenticate,
  allow('provider_staff', 'operator', 'admin'),
  async (req, res) => {
    const { id, feeId } = parse(FeeIdParams, req.params);
    ok(res, await service.deleteProviderFee(ctx(req), id, feeId));
  },
);
