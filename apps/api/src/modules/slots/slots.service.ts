import { pool, withTransaction } from '../../db/pool.js';
import { assertCanActForProvider } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import * as repo from './slots.repo.js';
import * as providersRepo from '../providers/providers.repo.js';
import type {
  CreateSlotBody,
  GenerateSlotsBody,
  ListSlotsQuery,
  SetSchedulesBody,
} from './slots.schema.js';

export async function listSchedules(providerId: number) {
  return repo.findSchedulesByProvider(pool, providerId);
}

export async function listSchedulesByCentre(centreId: number) {
  return repo.findSchedulesByCentre(pool, centreId);
}

export async function setSchedules(ctx: Ctx, providerId: number, body: SetSchedulesBody) {
  return withTransaction(async (tx) => {
    await assertCanActForProvider(tx, ctx.user, providerId, ['owner', 'scheduler']);
    const centre = await providersRepo.findCentre(tx, body.centre_id);
    if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Operating centre');
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

export async function listSlots(providerId: number, query: ListSlotsQuery & { centreId?: number }) {
  return repo.findSlots(pool, providerId, query);
}

export async function listSlotsByCentre(centreId: number, query: ListSlotsQuery) {
  return repo.findSlotsByCentre(pool, centreId, query);
}

export async function createSlot(ctx: Ctx, providerId: number, body: CreateSlotBody) {
  const start = new Date(body.start_time);
  const end = new Date(body.end_time);
  if (end <= start) throw AppError.badRequest('end_time must be after start_time');

  return withTransaction(async (tx) => {
    await assertCanActForProvider(tx, ctx.user, providerId, ['owner', 'scheduler', 'clinician']);
    const centre = await providersRepo.findCentre(tx, body.centre_id);
    if (!centre || centre.provider_id !== providerId) {
      throw AppError.notFound('Operating centre');
    }
    const id = await repo.insertSlot(
      tx,
      body.centre_id,
      providerId,
      start,
      end,
      body.price ?? null,
      body.currency ?? null,
    );
    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'SLOT_CREATED',
      entityType: 'provider_slot',
      entityId: id,
      ip: ctx.ip,
      metadata: {
        provider_id: providerId,
        centre_id: body.centre_id,
        start_time: body.start_time,
        price: body.price,
        currency: body.currency,
      },
    });
    return repo.findSlotById(tx, id);
  });
}

export async function generateSlots(ctx: Ctx, providerId: number, body: GenerateSlotsBody) {
  const startDate = new Date(`${body.start_date}T00:00:00Z`);
  const endDate = new Date(`${body.end_date}T23:59:59Z`);
  if (endDate <= startDate) throw AppError.badRequest('end_date must be after start_date');

  return withTransaction(async (tx) => {
    await assertCanActForProvider(tx, ctx.user, providerId, ['owner', 'scheduler']);
    const centre = await providersRepo.findCentre(tx, body.centre_id);
    if (!centre || centre.provider_id !== providerId) {
      throw AppError.notFound('Operating centre');
    }
    const schedules = await repo.findSchedulesByProviderAndCentre(tx, providerId, body.centre_id);
    if (!schedules.length) {
      throw AppError.badRequest('This centre has no active schedules configured');
    }

    const schedulesByDay = new Map(
      schedules.filter((s) => s.is_active).map((s) => [s.day_of_week, s]),
    );
    const slotsToCreate: {
      start_time: Date;
      end_time: Date;
      price?: number | null;
      currency?: string | null;
    }[] = [];

    const current = new Date(startDate);
    while (current <= endDate) {
      const dayOfWeek = current.getUTCDay();
      const schedule = schedulesByDay.get(dayOfWeek);
      if (schedule) {
        const [openH, openM] = schedule.open_time.split(':').map(Number);
        const [closeH, closeM] = schedule.close_time.split(':').map(Number);
        if (
          openH !== undefined &&
          openM !== undefined &&
          closeH !== undefined &&
          closeM !== undefined
        ) {
          const dayStart = new Date(
            Date.UTC(
              current.getUTCFullYear(),
              current.getUTCMonth(),
              current.getUTCDate(),
              openH,
              openM,
            ),
          );
          const dayEnd = new Date(
            Date.UTC(
              current.getUTCFullYear(),
              current.getUTCMonth(),
              current.getUTCDate(),
              closeH,
              closeM,
            ),
          );

          let slotStart = new Date(dayStart);
          while (
            slotStart.getTime() + schedule.slot_duration_minutes * 60_000 <=
            dayEnd.getTime()
          ) {
            const slotEnd = new Date(slotStart.getTime() + schedule.slot_duration_minutes * 60_000);
            slotsToCreate.push({ start_time: new Date(slotStart), end_time: slotEnd });
            slotStart = slotEnd;
          }
        }
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const createdCount = await repo.insertSlotsBulk(
      tx,
      body.centre_id,
      providerId,
      slotsToCreate.map((s) => ({
        ...s,
        price: body.price ?? null,
        currency: body.currency ?? null,
      })),
    );
    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'SLOTS_BULK_GENERATED',
      entityType: 'provider',
      entityId: providerId,
      ip: ctx.ip,
      metadata: {
        generated: createdCount,
        centre_id: body.centre_id,
        range: [body.start_date, body.end_date],
        price: body.price,
        currency: body.currency,
      },
    });

    return { created_count: createdCount };
  });
}

export async function cancelSlot(ctx: Ctx, slotId: number) {
  return withTransaction(async (tx) => {
    const slot = await repo.findSlotById(tx, slotId, { forUpdate: true });
    if (!slot) throw AppError.notFound('Slot');
    await assertCanActForProvider(tx, ctx.user, slot.provider_id, [
      'owner',
      'scheduler',
      'clinician',
    ]);
    assertTransition('provider_slot', slot.status, 'cancelled');

    await repo.updateSlotStatus(tx, slotId, 'cancelled');
    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'SLOT_CANCELLED',
      entityType: 'provider_slot',
      entityId: slotId,
      ip: ctx.ip,
      metadata: { provider_id: slot.provider_id, centre_id: slot.centre_id },
    });

    return repo.findSlotById(tx, slotId);
  });
}

export interface UpdateSlotPriceBody {
  price: number;
  currency: string;
}

export async function updateSlotPrice(ctx: Ctx, slotId: number, body: UpdateSlotPriceBody) {
  return withTransaction(async (tx) => {
    const slot = await repo.findSlotById(tx, slotId, { forUpdate: true });
    if (!slot) throw AppError.notFound('Slot');
    await assertCanActForProvider(tx, ctx.user, slot.provider_id, ['owner', 'scheduler']);
    await repo.updateSlotPrice(tx, slotId, body.price, body.currency);
    await audit(tx, {
      actorUserId: ctx.user.id,
      action: 'SLOT_PRICE_UPDATED',
      entityType: 'provider_slot',
      entityId: slotId,
      ip: ctx.ip,
      metadata: {
        provider_id: slot.provider_id,
        centre_id: slot.centre_id,
        price: body.price,
        currency: body.currency,
      },
    });
    return repo.findSlotById(tx, slotId);
  });
}
