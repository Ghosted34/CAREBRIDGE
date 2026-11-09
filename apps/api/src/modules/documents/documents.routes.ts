import { Router } from 'express';
import { created, ctx, ok } from '../../lib/http.js';
import { IdParam, parse } from '../../lib/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { ConfirmUploadBody, RequestUploadUrlBody } from './documents.schema.js';
import * as service from './documents.service.js';

export const documentsRouter = Router();

documentsRouter.post('/requests/:id/documents/upload-url', authenticate, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.requestUploadUrl(ctx(req), id, parse(RequestUploadUrlBody, req.body)));
});

documentsRouter.post('/requests/:id/documents', authenticate, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  created(res, await service.confirmUpload(ctx(req), id, parse(ConfirmUploadBody, req.body)));
});

documentsRouter.get('/requests/:id/documents', authenticate, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.listForRequest(ctx(req), id));
});

// Mock endpoints for local testing/demo
documentsRouter.put('/documents/mock-upload/:key', (_req, res) => {
  res.status(200).json({ status: 'uploaded' });
});

documentsRouter.get('/documents/mock-download/:key', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(`Mock content for clinical document ${req.params.key}`);
});
