import { Router } from 'express';
import { z } from 'zod';
import { ctx, ok } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { CONSENT_TYPES } from './policies.js';
import * as service from './consents.service.js';

export const consentsRouter = Router();

const DecideBody = z.object({
  consent_type: z.enum(CONSENT_TYPES),
  granted: z.boolean(),
  source: z.enum(['settings', 'request_form']).default('settings'),
});

// Public: shown on the registration page and the policies page.
consentsRouter.get('/consents/policies', (_req, res) => {
  ok(res, service.publicPolicies());
});

consentsRouter.get('/consents', authenticate, async (req, res) => {
  ok(res, await service.mine(ctx(req)));
});

consentsRouter.post('/consents', authenticate, async (req, res) => {
  const body = parse(DecideBody, req.body);
  ok(res, await service.decide(ctx(req), body.consent_type, body.granted, body.source));
});
