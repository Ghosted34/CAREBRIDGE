import { Router } from 'express';
import { created, ctx, ok } from '../../lib/http.js';
import { IdParam, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import { InitializePaymentBody, WebhookBody } from './payments.schema.js';
import * as service from './payments.service.js';

export const paymentsRouter = Router();

paymentsRouter.post('/requests/:id/payments/initialize', authenticate, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  created(res, await service.initialize(ctx(req), id, parse(InitializePaymentBody, req.body)));
});

paymentsRouter.get('/requests/:id/payments', authenticate, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.listForRequest(ctx(req), id));
});

paymentsRouter.post('/payments/webhook', async (req, res) => {
  const signature = req.headers['x-paystack-signature'] as string | undefined;
  ok(res, await service.handleWebhook(signature, parse(WebhookBody, req.body), req.ip ?? null));
});

// Demo/Test payment simulation route
paymentsRouter.post(
  '/payments/:id/simulate-success',
  authenticate,
  allow('patient', 'operator', 'admin'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    ok(res, await service.simulateSuccess(ctx(req), id));
  },
);
