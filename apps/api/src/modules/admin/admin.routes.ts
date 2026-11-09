import { Router } from 'express';
import { z } from 'zod';
import { created, ctx, list, ok } from '../../lib/http.js';
import { IdParam, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import {
  AddMemberBody,
  AuditLogsQuery,
  CreateProviderBody,
  SetUserStatusBody,
  SetVerificationBody,
  UsersQuery,
  ProvidersQuery,
} from './admin.schema.js';
import * as service from './admin.service.js';

export const adminRouter = Router();
const admin = [authenticate, allow('admin')];
const staff = [authenticate, allow('admin', 'operator')];

adminRouter.get('/admin/metrics', ...staff, async (_req, res) => {
  ok(res, await service.metrics());
});

adminRouter.get('/admin/audit-logs', ...staff, async (req, res) => {
  const q = parse(AuditLogsQuery, req.query);
  list(res, await service.listAuditLogs(q), q);
});

adminRouter.get('/admin/stuck-requests', ...staff, async (_req, res) => {
  ok(res, await service.listStuckRequests());
});

adminRouter.get('/admin/users', ...admin, async (req, res) => {
  const q = parse(UsersQuery, req.query);
  list(res, await service.listUsers(q), q);
});

adminRouter.post('/admin/users/:id/status', ...admin, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.setUserStatus(ctx(req), id, parse(SetUserStatusBody, req.body).status));
});

adminRouter.get('/admin/providers', authenticate, allow('admin', 'operator'), async (req, res) => {
  const q = parse(ProvidersQuery, req.query);
  list(res, await service.listProviders(q), q);
});

adminRouter.get('/admin/providers/:id/members', ...admin, async (req, res) => {
  ok(res, await service.listMembers(parse(IdParam, req.params).id));
});

adminRouter.post('/admin/providers', ...admin, async (req, res) => {
  created(res, await service.createProvider(ctx(req), parse(CreateProviderBody, req.body)));
});

adminRouter.post('/admin/providers/:id/verification', ...admin, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(
    res,
    await service.setVerification(
      ctx(req),
      id,
      parse(SetVerificationBody, req.body).verification_status,
    ),
  );
});

adminRouter.post('/admin/providers/:id/members', ...admin, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  ok(res, await service.addMember(ctx(req), id, parse(AddMemberBody, req.body)));
});

const MemberParams = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});
adminRouter.delete('/admin/providers/:id/members/:userId', ...admin, async (req, res) => {
  const { id, userId } = parse(MemberParams, req.params);
  ok(res, await service.removeMember(ctx(req), id, userId));
});
