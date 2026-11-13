import cors from 'cors';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { appointmentNotesRouter } from './modules/appointment_notes/appointment_notes.routes.js';
import { appointmentsRouter } from './modules/appointments/appointments.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { availabilityRouter } from './modules/availability/availability.routes.js';
import { consentsRouter } from './modules/consents/consents.routes.js';
import { docsRouter } from './modules/docs/docs.routes.js';
import { documentsRouter } from './modules/documents/documents.routes.js';
import { estimatesRouter } from './modules/estimates/estimates.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';

import { paymentsRouter } from './modules/payments/payments.routes.js';
import { providersRouter } from './modules/providers/providers.routes.js';
import { referralsRouter } from './modules/referrals/referrals.routes.js';
import { requestsRouter } from './modules/requests/requests.routes.js';
import { slotsRouter } from './modules/slots/slots.routes.js';

/** Build the Express app without listening, so tests can drive it with supertest. */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind one reverse proxy in deployment; makes req.ip meaningful
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '100kb' }));
  // API calls only (the SPA's static files don't count). Per IP: a clinic office often shares one
  // address, so the default leaves room for several staff working at once. Sign-in has its own,
  // stricter limit (auth.routes.ts).
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.NODE_ENV === 'test' ? 10_000 : env.API_RATE_LIMIT_PER_15_MIN,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'OnDiGoH API' });
  });

  const v1 = Router();
  v1.use(
    authRouter,
    availabilityRouter,
    appointmentNotesRouter,
    consentsRouter,
    notificationsRouter,
    providersRouter,
    requestsRouter,
    appointmentsRouter,
    slotsRouter,
    referralsRouter,
    estimatesRouter,
    documentsRouter,
    paymentsRouter,
    docsRouter,
    adminRouter,
  );
  app.use('/api/v1', v1);

  // Serve the built web app (single deployment: web + api together).
  // Static assets are served from dist/public; all other non-API routes fall
  // through to index.html so React Router client-side routing works.
  // Uses app.use() (middleware) rather than app.get() with a path pattern,
  // because Express 5's path-to-regexp does not support bare '*' wildcards.
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'public');
  app.use(express.static(publicDir));
  app.use((_req, res) => {
    // API routes that don't match should 404 via the notFoundHandler below.
    // Only non-API routes fall through to the SPA's index.html.
    if (_req.path.startsWith('/api/')) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Not found', details: {} },
      });
    } else {
      res.sendFile(path.join(publicDir, 'index.html'));
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
