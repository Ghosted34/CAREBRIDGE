import { pool, withTransaction } from '../../db/pool.js';
import { assertCanActForProvider } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import * as repo from './slots.repo.js';
import * as providersRepo from '../providers/providers.repo.js';
import type { SetSchedulesBody } from './slots.schema.js';

export async function listSchedules(providerId: number) {
  return repo.findSchedulesByProvider(pool, providerId);
}

export async function listSchedulesByCentre(centreId: number) {
  return repo.findSchedulesByCentre(pool, centreId);
}

/**
 * Opening hours per centre, in Lagos wall-clock time (day_of_week 0 = Sunday). Free times are
 * computed from these on demand (modules/availability), so there is nothing to generate.
 */
export async function setSchedules(ctx: Ctx, providerId: number, body: SetSchedulesBody) {
  return withTransaction(async (tx) => {
    await assertCanActForProvider(tx, ctx.user, providerId, ['owner', 'scheduler']);
    const centre = await providersRepo.findCentre(tx, body.centre_id);
    if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Operating centre');
    for (const d of body.schedules) {
      if (d.close_time <= d.open_time) {
        throw AppError.badRequest(`Day ${d.day_of_week}: closing time must be after opening time`);
      }
    }
    if (new Set(body.schedules.map((d) => d.day_of_week)).size !== body.schedules.length) {
      throw AppError.badRequest('Each day can appear only once');
    }
    await repo.replaceSchedules(tx, providerId, body.centre_id, body.schedules);
    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'PROVIDER_SCHEDULE_UPDATED',
      entityType: 'provider_centre',
      entityId: body.centre_id,
      ip: ctx.ip,
      metadata: { days_count: body.schedules.length },
    });
    return repo.findSchedulesByCentre(tx, body.centre_id);
  });
}
