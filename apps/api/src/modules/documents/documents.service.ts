import crypto from 'node:crypto';
import { pool, withTransaction } from '../../db/pool.js';
import { isPlatformStaff, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import * as notifications from '../notifications/notifications.service.js';
import * as requestsRepo from '../requests/requests.repo.js';
import * as repo from './documents.repo.js';
import type { ConfirmUploadBody, RequestUploadUrlBody } from './documents.schema.js';
import { getStorageProvider } from './providers/registry.js';

async function assertCanAccessRequest(ctx: Ctx, careRequestId: number) {
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
  return request;
}

export async function requestUploadUrl(
  ctx: Ctx,
  careRequestId: number,
  body: RequestUploadUrlBody,
) {
  await assertCanAccessRequest(ctx, careRequestId);

  const ext = body.file_name.includes('.') ? body.file_name.split('.').pop() : 'bin';
  const randomSuffix = crypto.randomBytes(12).toString('hex');
  const storageKey = `requests/${careRequestId}/${Date.now()}-${randomSuffix}.${ext}`;

  const storage = getStorageProvider();
  const urlInfo = await storage.getUploadUrl({
    key: storageKey,
    mimeType: body.mime_type,
    expiresInSeconds: 900,
  });

  return {
    storage_key: storageKey,
    upload_url: urlInfo.uploadUrl,
    method: urlInfo.method,
    headers: urlInfo.headers ?? {},
    expires_in_seconds: 900,
  };
}

export async function confirmUpload(ctx: Ctx, careRequestId: number, body: ConfirmUploadBody) {
  const request = await assertCanAccessRequest(ctx, careRequestId);

  return withTransaction(async (tx) => {
    const id = await repo.insert(tx, {
      care_request_id: careRequestId,
      uploader_user_id: ctx.user.id,
      document_type: body.document_type,
      file_name: body.file_name,
      mime_type: body.mime_type,
      file_size_bytes: body.file_size_bytes,
      storage_key: body.storage_key,
    });

    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'clinical_document',
      entityId: id,
      ip: ctx.ip,
      metadata: {
        care_request_id: careRequestId,
        document_type: body.document_type,
        file_size_bytes: body.file_size_bytes,
      },
    });

    // Notify assigned clinic staff if patient uploaded, or patient if clinic uploaded
    if (ctx.user.role === 'patient' && request.assigned_provider_id) {
      const staff = await notifications.providerStaffIds(tx, request.assigned_provider_id, [
        'owner',
        'clinician',
      ]);
      await notifications.notify(tx, staff, 'document_uploaded', { request_id: careRequestId });
    } else if (ctx.user.role !== 'patient') {
      await notifications.notify(tx, [request.patient_user_id], 'document_uploaded', {
        request_id: careRequestId,
      });
    }

    const doc = await repo.findById(tx, id);
    if (!doc) throw AppError.notFound('Document');

    const storage = getStorageProvider();
    const { downloadUrl } = await storage.getDownloadUrl({
      key: doc.storage_key,
      expiresInSeconds: 3600,
    });

    return { ...doc, download_url: downloadUrl };
  });
}

export async function listForRequest(ctx: Ctx, careRequestId: number) {
  await assertCanAccessRequest(ctx, careRequestId);

  const docs = await repo.findByRequest(pool, careRequestId);
  const storage = getStorageProvider();

  return Promise.all(
    docs.map(async (doc) => {
      const { downloadUrl } = await storage.getDownloadUrl({
        key: doc.storage_key,
        expiresInSeconds: 3600,
      });
      return { ...doc, download_url: downloadUrl };
    }),
  );
}
