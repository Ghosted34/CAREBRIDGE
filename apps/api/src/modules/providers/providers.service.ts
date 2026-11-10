import type { z } from 'zod';
import { pool, withTransaction, type Db } from '../../db/pool.js';
import { assertCanActForProvider, assertOwnsAClinic, isPlatformStaff } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { assertTransition } from '../../lib/stateMachine.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import type { AuthUser } from '../../types.js';
import * as notifications from '../notifications/notifications.service.js';
import * as slotsRepo from '../slots/slots.repo.js';
import type { CreateSlotBody } from '../slots/slots.schema.js';
import type {
  AddCentreCaregiverBody,
  CentreScheduleQuery,
  CreateCentreBody,
  GenerateCentreSlotsBody,
  SetCentreSchedulesBody,
  UpdateCentreBody,
  AddTeamMemberBody,
  SearchStaffQuery,
} from './providers.schema.js';
import * as repo from './providers.repo.js';

/**
 * The caller's role at this clinic, ignoring verification state, so a clinic that is still awaiting
 * review gets a clear "not verified yet" answer instead of a bare 403. Platform staff pass through:
 * they coordinate on CareBridge's behalf.
 */
async function roleAt(db: Db, user: AuthUser, providerId: number) {
  if (isPlatformStaff(user)) return 'owner' as const;
  if (user.role !== 'provider_staff') throw AppError.forbidden();
  const membership = await repo.findMembership(db, providerId, user.id);
  if (!membership) throw AppError.forbidden('You are not a member of this provider');
  return membership.provider_role as string;
}

/** Only the clinic owner (or platform staff) manages the roster. */
async function assertOwner(db: Db, user: AuthUser, providerId: number) {
  if ((await roleAt(db, user, providerId)) !== 'owner') {
    throw AppError.forbidden('Only the clinic owner can manage the team');
  }
}

/** Team management is self-service, but only once CareBridge has verified the facility. */
async function assertVerifiedClinic(db: Db, providerId: number) {
  const provider = await repo.findProvider(db, providerId);
  if (!provider) throw AppError.notFound('Provider');
  if (provider.verification_status !== 'verified' || provider.status !== 'active') {
    throw AppError.conflict(
      'PROVIDER_NOT_VERIFIED',
      'Your facility is still awaiting CareBridge verification, so team management is locked',
    );
  }
  return provider;
}

/** Any member of the clinic (or platform staff) may see who works there, verified or not. */
export async function listTeam(c: Ctx, providerId: number) {
  await roleAt(pool, c.user, providerId);
  if (!(await repo.findProvider(pool, providerId))) throw AppError.notFound('Provider');
  return repo.listMembers(pool, providerId);
}

/**
 * Clinic owners add, invite and re-role their own team (clinician, scheduler, receptionist)
 * without going through CareBridge. An invited account that is still pending is activated: the
 * verified owner has vouched for them, and their facility is already approved.
 */
export async function addTeamMember(
  c: Ctx,
  providerId: number,
  input: z.infer<typeof AddTeamMemberBody>,
) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    const provider = await assertVerifiedClinic(tx, providerId);
    const user = await repo.findUser(tx, input.user_id);
    if (!user) throw AppError.notFound('User');
    if (user.role !== 'provider_staff') {
      throw AppError.conflict(
        'NOT_PROVIDER_STAFF',
        'Only provider_staff accounts can be linked to a clinic',
      );
    }
    if (user.status === 'suspended') {
      throw AppError.conflict(
        'ACCOUNT_SUSPENDED',
        'This account is suspended and cannot be added to a clinic',
      );
    }
    await repo.upsertMember(tx, providerId, input.user_id, input.provider_role);
    const activated = user.status === 'pending';
    if (activated) await repo.setUserStatus(tx, input.user_id, 'active');
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_MEMBER_SET',
      entityType: 'provider',
      entityId: providerId,
      ip: c.ip,
      metadata: {
        user_id: input.user_id,
        provider_role: input.provider_role,
        managed_by: 'clinic_owner',
        activated,
      },
    });
    if (activated) {
      await audit(tx, {
        actorUserId: c.user.id,
        action: 'USER_ACTIVATED',
        entityType: 'user',
        entityId: input.user_id,
        ip: c.ip,
        metadata: { from: 'pending', by: 'clinic_owner' },
      });
      await notifications.notify(tx, [input.user_id], 'account_approved', {});
    }
    await notifications.notify(tx, [input.user_id], 'team_invite', {
      provider: provider.display_name as string,
      role: input.provider_role,
    });
    return {
      provider_id: providerId,
      user_id: input.user_id,
      provider_role: input.provider_role,
      activated,
    };
  });
}

/** Owners remove their own team members. Nobody may remove an owner — CareBridge does that. */
export async function removeTeamMember(c: Ctx, providerId: number, userId: number) {
  return withTransaction(async (tx) => {
    await assertOwner(tx, c.user, providerId);
    await assertVerifiedClinic(tx, providerId);
    if (userId === c.user.id) {
      throw AppError.conflict('SELF_CHANGE', 'You cannot remove yourself from your own clinic');
    }
    const member = await repo.findMembership(tx, providerId, userId);
    if (!member) throw AppError.notFound('Membership');
    if (member.provider_role === 'owner') {
      throw AppError.conflict(
        'OWNER_CHANGE_FORBIDDEN',
        'Clinic ownership is changed by CareBridge, not by the clinic',
      );
    }
    await repo.removeMember(tx, providerId, userId);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_MEMBER_REMOVED',
      entityType: 'provider',
      entityId: providerId,
      ip: c.ip,
      metadata: { user_id: userId, managed_by: 'clinic_owner' },
    });
    return { provider_id: providerId, user_id: userId, removed: true };
  });
}

/**
 * Staff accounts a clinic owner may invite, by email or name. Only owners of a verified clinic
 * (and platform staff) may look people up, and only contact details are returned — one clinic must
 * not be able to enumerate another clinic's roster.
 */
export async function searchStaff(c: Ctx, q: z.infer<typeof SearchStaffQuery>) {
  await assertOwnsAClinic(pool, c.user);
  return repo.searchStaffAccounts(pool, q.q, q.limit);
}

// ---- operating centres ----

/** Public: the opening hours of one centre. */
export async function listCentreSchedules(centreId: number) {
  const centre = await repo.findCentre(pool, centreId);
  if (!centre) throw AppError.notFound('Operating centre');
  return slotsRepo.findSchedulesByCentre(pool, centreId);
}

/** Public: the operating centres of a verified, active provider (directory information). */
export async function listCentres(providerId: number) {
  if (!(await repo.findProvider(pool, providerId))) throw AppError.notFound('Provider');
  return repo.listCentres(pool, providerId);
}

export async function getCentre(centreId: number) {
  const centre = await repo.findCentre(pool, centreId);
  if (!centre) throw AppError.notFound('Operating centre');
  return centre;
}

/** Owner or scheduler of the provider defines where the clinic operates. */
export async function addCentre(
  c: Ctx,
  providerId: number,
  body: z.infer<typeof CreateCentreBody>,
) {
  return withTransaction(async (tx) => {
    await assertCanActForProvider(tx, c.user, providerId, ['owner', 'scheduler']);
    const provider = await repo.findProvider(tx, providerId);
    if (!provider) throw AppError.notFound('Provider');
    const id = await repo.insertCentre(tx, providerId, {
      name: body.name,
      address: body.address,
      city: body.city,
      phone: body.phone ?? null,
    });
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_CENTRE_ADDED',
      entityType: 'provider_centre',
      entityId: id,
      ip: c.ip,
      metadata: { provider_id: providerId, name: body.name },
    });
    return repo.findCentre(tx, id);
  });
}

export async function changeCentre(
  c: Ctx,
  centreId: number,
  body: z.infer<typeof UpdateCentreBody>,
) {
  return withTransaction(async (tx) => {
    const centre = await repo.findCentre(tx, centreId);
    if (!centre) throw AppError.notFound('Operating centre');
    await assertCanActForProvider(tx, c.user, centre.provider_id, ['owner', 'scheduler']);
    await repo.updateCentre(tx, centreId, body);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_CENTRE_UPDATED',
      entityType: 'provider_centre',
      entityId: centreId,
      ip: c.ip,
      metadata: body,
    });
    return repo.findCentre(tx, centreId);
  });
}

/** Centre-level opening hours replace the provider-wide schedule UI. */
export async function setCentreSchedules(
  c: Ctx,
  providerId: number,
  centreId: number,
  body: z.infer<typeof SetCentreSchedulesBody>,
) {
  return withTransaction(async (tx) => {
    const centre = await repo.findCentre(tx, centreId);
    if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Operating centre');
    await assertCanActForProvider(tx, c.user, providerId, ['owner', 'scheduler']);
    await slotsRepo.replaceSchedules(tx, providerId, centreId, body.schedules);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_CENTRE_SCHEDULE_UPDATED',
      entityType: 'provider_centre',
      entityId: centreId,
      ip: c.ip,
      metadata: { days_count: body.schedules.length },
    });
    return slotsRepo.findSchedulesByCentre(tx, centreId);
  });
}

/** Bookable capacity for one centre, public so patients can see real availability. */
export async function listCentreSlots(
  centreId: number,
  query: z.infer<typeof CentreScheduleQuery>,
) {
  const centre = await repo.findCentre(pool, centreId);
  if (!centre) throw AppError.notFound('Operating centre');
  return slotsRepo.findSlotsByCentre(pool, centreId, query);
}

export async function createCentreSlot(
  c: Ctx,
  providerId: number,
  centreId: number,
  body: z.infer<typeof CreateSlotBody>,
) {
  const start = new Date(body.start_time);
  const end = new Date(body.end_time);
  if (end <= start) throw AppError.badRequest('end_time must be after start_time');

  return withTransaction(async (tx) => {
    const centre = await repo.findCentre(tx, centreId);
    if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Operating centre');
    await assertCanActForProvider(tx, c.user, providerId, ['owner', 'scheduler', 'clinician']);
    const id = await slotsRepo.insertCentreSlot(tx, centreId, providerId, start, end);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'SLOT_CREATED',
      entityType: 'provider_slot',
      entityId: id,
      ip: c.ip,
      metadata: { provider_id: providerId, centre_id: centreId, start_time: body.start_time },
    });
    return slotsRepo.findSlotById(tx, id);
  });
}

export async function generateCentreSlots(
  c: Ctx,
  providerId: number,
  centreId: number,
  body: z.infer<typeof GenerateCentreSlotsBody>,
) {
  const startDate = new Date(`${body.start_date}T00:00:00Z`);
  const endDate = new Date(`${body.end_date}T23:59:59Z`);
  if (endDate <= startDate) throw AppError.badRequest('end_date must be after start_date');

  return withTransaction(async (tx) => {
    const centre = await repo.findCentre(tx, centreId);
    if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Operating centre');
    await assertCanActForProvider(tx, c.user, providerId, ['owner', 'scheduler']);
    const schedules = await slotsRepo.findSchedulesByCentre(tx, centreId);
    const active = schedules.filter((s) => s.is_active);
    if (!active.length) {
      throw AppError.badRequest('This centre has no active schedules configured');
    }

    const schedulesByDay = new Map(active.map((s) => [s.day_of_week, s]));
    const slotsToCreate: { start_time: Date; end_time: Date }[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const schedule = schedulesByDay.get(current.getUTCDay());
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

    const createdCount = await slotsRepo.insertSlotsBulk(tx, centreId, providerId, slotsToCreate);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'SLOTS_BULK_GENERATED',
      entityType: 'provider_centre',
      entityId: centreId,
      ip: c.ip,
      metadata: { generated: createdCount, range: [body.start_date, body.end_date] },
    });
    return { created_count: createdCount };
  });
}

export async function cancelCentreSlot(c: Ctx, centreId: number, slotId: number) {
  return withTransaction(async (tx) => {
    const slot = await slotsRepo.findSlotById(tx, slotId, { forUpdate: true });
    if (!slot) throw AppError.notFound('Slot');
    if (slot.centre_id !== centreId) throw AppError.notFound('Slot');
    const centre = await repo.findCentre(tx, centreId);
    if (!centre || centre.provider_id !== slot.provider_id)
      throw AppError.notFound('Operating centre');
    await assertCanActForProvider(tx, c.user, slot.provider_id, [
      'owner',
      'scheduler',
      'clinician',
    ]);
    assertTransition('provider_slot', slot.status, 'cancelled');
    await slotsRepo.updateSlotStatus(tx, slotId, 'cancelled');
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'SLOT_CANCELLED',
      entityType: 'provider_slot',
      entityId: slotId,
      ip: c.ip,
      metadata: { provider_id: slot.provider_id, centre_id: slot.centre_id },
    });
    return slotsRepo.findSlotById(tx, slotId);
  });
}

// ---- centre caregivers ----

export async function listCentreCaregivers(centreId: number) {
  const centre = await repo.findCentre(pool, centreId);
  if (!centre) throw AppError.notFound('Operating centre');
  return repo.listCentreCaregivers(pool, centreId);
}

/**
 * Link a provider_staff member (usually a clinician) to a centre so patients can book
 * consultations with them. Owner or scheduler of the provider manages the roster.
 */
export async function addCentreCaregiver(
  c: Ctx,
  providerId: number,
  centreId: number,
  body: z.infer<typeof AddCentreCaregiverBody>,
) {
  return withTransaction(async (tx) => {
    await assertCanActForProvider(tx, c.user, providerId, ['owner', 'scheduler']);
    const centre = await repo.findCentre(tx, centreId);
    if (!centre || centre.provider_id !== providerId) throw AppError.notFound('Operating centre');
    const user = await repo.findUser(tx, body.user_id);
    if (!user) throw AppError.notFound('User');
    if (user.role !== 'provider_staff' || user.status !== 'active') {
      throw AppError.conflict(
        'NOT_ACTIVE_STAFF',
        'Only active provider staff can be linked to a centre as a caregiver',
      );
    }
    const membership = await repo.findMembership(tx, providerId, body.user_id);
    if (!membership) {
      throw AppError.conflict(
        'NOT_PROVIDER_STAFF',
        'This staff account is not a member of this provider',
      );
    }
    await repo.upsertCentreCaregiver(tx, centreId, providerId, body.user_id, !!body.is_active);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'PROVIDER_CENTRE_CAREGIVER_SET',
      entityType: 'provider_centre',
      entityId: centreId,
      ip: c.ip,
      metadata: { user_id: body.user_id, is_active: !!body.is_active },
    });
    return {
      centre_id: centreId,
      user_id: body.user_id,
      provider_role: membership.provider_role,
      is_active: !!body.is_active,
    };
  });
}
