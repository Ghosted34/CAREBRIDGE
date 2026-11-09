import crypto from 'node:crypto';
import { pool, withTransaction, type Row } from '../../db/pool.js';
import { isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import * as notifications from '../notifications/notifications.service.js';
import * as requestsRepo from '../requests/requests.repo.js';
import * as repo from './payments.repo.js';
import type { InitializePaymentBody, WebhookBody } from './payments.schema.js';
import { getPaymentGateway } from './providers/registry.js';

export async function initialize(ctx: Ctx, careRequestId: number, body: InitializePaymentBody) {
  const request = await requestsRepo.findById(pool, careRequestId);
  if (!request) throw AppError.notFound('Care request');

  if (ctx.user.role === 'patient' && request.patient_user_id !== ctx.user.id) {
    throw AppError.notFound('Care request');
  }

  const [userRows] = await pool.execute<Row[]>('SELECT email FROM users WHERE id = ?', [
    ctx.user.id,
  ]);
  const userEmail = (userRows[0]?.email as string) ?? 'patient@carebridge.local';

  const gateway = getPaymentGateway();
  const reference = `CB_PAY_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  return withTransaction(async (tx) => {
    const id = await repo.insert(tx, {
      care_request_id: careRequestId,
      payer_user_id: ctx.user.id,
      payee_provider_id: request.assigned_provider_id ?? null,
      amount: body.amount,
      currency: body.currency,
      payment_provider: gateway.name,
      provider_reference: reference,
      status: 'pending',
    });

    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'PAYMENT_INITIALIZED',
      entityType: 'payment',
      entityId: id,
      ip: ctx.ip,
      metadata: {
        care_request_id: careRequestId,
        amount: body.amount,
        reference,
        gateway: gateway.name,
      },
    });

    const initResult = await gateway.initialize({
      amount: body.amount,
      currency: body.currency,
      email: userEmail,
      reference,
      callbackUrl: body.callback_url,
    });

    return {
      payment_id: id,
      reference,
      authorization_url: initResult.authorizationUrl,
      access_code: initResult.accessCode,
    };
  });
}

export async function processPaymentSuccess(reference: string, ip: string | null) {
  return withTransaction(async (tx) => {
    const payment = await repo.findByReference(tx, reference, { forUpdate: true });
    if (!payment) throw AppError.notFound('Payment');

    if (payment.status === 'successful') {
      return payment; // Idempotent
    }

    assertTransition('payment', payment.status, 'successful');
    await repo.updateStatus(tx, payment.id, 'successful');

    await audit(tx, {
      actorUserId: payment.payer_user_id,
      action: 'PAYMENT_COMPLETED',
      entityType: 'payment',
      entityId: payment.id,
      ip,
      metadata: {
        care_request_id: payment.care_request_id,
        amount: Number(payment.amount),
        reference,
      },
    });

    const formattedAmount = `${payment.currency} ${Number(payment.amount).toLocaleString()}`;
    await notifications.notify(tx, [payment.payer_user_id], 'payment_successful', {
      request_id: payment.care_request_id,
      amount: formattedAmount,
    });

    if (payment.payee_provider_id) {
      const staff = await notifications.providerStaffIds(tx, payment.payee_provider_id, [
        'owner',
        'clinician',
        'receptionist',
      ]);
      await notifications.notify(tx, staff, 'payment_successful', {
        request_id: payment.care_request_id,
        amount: formattedAmount,
      });
    }

    return repo.findById(tx, payment.id);
  });
}

export async function handleWebhook(
  signature: string | undefined,
  body: WebhookBody,
  ip: string | null,
) {
  const gateway = getPaymentGateway();
  if (signature && !gateway.verifySignature(signature, body)) {
    throw AppError.forbidden();
  }

  if (body.event === 'charge.success' || body.data.status === 'success') {
    return processPaymentSuccess(body.data.reference, ip);
  }

  return { received: true };
}

export async function simulateSuccess(ctx: Ctx, paymentId: number) {
  const payment = await repo.findById(pool, paymentId);
  if (!payment || !payment.provider_reference) throw AppError.notFound('Payment');
  return processPaymentSuccess(payment.provider_reference, ctx.ip);
}

export async function listForRequest(ctx: Ctx, careRequestId: number) {
  const request = await requestsRepo.findById(pool, careRequestId);
  if (!request) throw AppError.notFound('Care request');

  if (ctx.user.role === 'patient') {
    if (request.patient_user_id !== ctx.user.id) throw AppError.notFound('Care request');
  } else if (!isPlatformStaff(ctx.user)) {
    const myProviders = await memberProviderIds(pool, ctx.user.id);
    if (!request.assigned_provider_id || !myProviders.includes(request.assigned_provider_id)) {
      throw AppError.forbidden();
    }
  }

  return repo.findByRequest(pool, careRequestId);
}
