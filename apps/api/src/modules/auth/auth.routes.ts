import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { created, ok } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import { authenticate, currentUser } from '../../middleware/auth.js';
import { LoginBody, RegisterBody } from './auth.schema.js';
import * as service from './auth.service.js';

export const authRouter = Router();

// Tighter limit on credential endpoints to slow brute-force attempts.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

authRouter.post('/auth/register', credentialLimiter, async (req, res) => {
  created(res, await service.register(parse(RegisterBody, req.body), req.ip ?? null));
});

authRouter.post('/auth/login', credentialLimiter, async (req, res) => {
  ok(res, await service.login(parse(LoginBody, req.body), req.ip ?? null));
});

authRouter.get('/me', authenticate, async (req, res) => {
  ok(res, await service.me(currentUser(req).id));
});
