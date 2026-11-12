import { Router } from 'express';
import { z } from 'zod';
import { ctx, ok } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import { CentreAvailabilityQuery, SearchBody } from './availability.schema.js';
import * as service from './availability.service.js';

export const availabilityRouter = Router();

/** Public: the list of problems a patient can choose from. */
availabilityRouter.get('/problems', (_req, res) => {
  ok(res, service.listProblems());
});

/** The MVP search: problem + date periods + address → clinics, centres and free times. */
availabilityRouter.post('/search', authenticate, allow('patient'), async (req, res) => {
  ok(res, await service.search(ctx(req), parse(SearchBody, req.body)));
});

const CentreParam = z.object({ centreId: z.coerce.number().int().positive() });

/** Free times at one centre (signed-in users; reveals no patient information). */
availabilityRouter.get('/centres/:centreId/availability', authenticate, async (req, res) => {
  const { centreId } = parse(CentreParam, req.params);
  ok(res, await service.centreAvailability(centreId, parse(CentreAvailabilityQuery, req.query)));
});
