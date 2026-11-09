import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { ctx, list, ok } from '../../lib/http.js';
import { IdParam, Pagination, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import { AddTeamMemberBody, SearchStaffQuery } from './providers.schema.js';
import * as repo from './providers.repo.js';
import * as service from './providers.service.js';

export const providersRouter = Router();

const TeamMemberParams = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
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
