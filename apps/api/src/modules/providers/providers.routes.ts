import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { list, ok } from '../../lib/http.js';
import { IdParam, Pagination, parse } from '../../lib/validate.js';
import * as repo from './providers.repo.js';

export const providersRouter = Router();

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
