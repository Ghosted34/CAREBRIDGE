import { pool, withTransaction } from '../../db/pool.js';
import { assertCanActForProvider, memberProviderIds } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import type { ProviderRole } from '../../types.js';
import * as notifications from '../notifications/notifications.service.js';
import * as appointmentsRepo from '../appointments/appointments.repo.js';
import * as requestsRepo from '../requests/requests.repo.js';
import { assertTransition, canTransition } from '../../lib/stateMachine.js';
import * as repo from './appointment_notes.repo.js';
import type {
  CreateAppointmentNoteBody,
  ListAppointmentNotesQuery,
} from './appointment_notes.schema.js';

/**
 * Who may write each note type. Prescriptions and referrals are clinical decisions, so only dentists
 * (clinicians) and clinic owners; follow-up and closing notes may also come from schedulers.
 * Receptionists don't write notes. CareBridge staff (operators/admins) never write clinical notes.
 */
export const NOTE_AUTHORS: Record<string, readonly ProviderRole[]> = {
  prescription: ['owner', 'clinician'],
  referral: ['owner', 'clinician'],
  follow_up: ['owner', 'clinician', 'scheduler'],
  closing_consultancy: ['owner', 'clinician', 'scheduler'],
};

/** Notes can only be written once the patient has actually been seen. */
const SEEN_STATUSES = ['checked_in', 'completed'];

/**
 * Add a post-visit note: only after the patient was checked in, only by the appointment's clinic
 * (role depends on the note type). The platform records what the clinician decided; it does not diagnose.
 */
export async function createNote(c: Ctx, appointmentId: number, body: CreateAppointmentNoteBody) {
  if (c.user.role !== 'provider_staff')
    throw AppError.forbidden('Only clinic staff can add visit notes');
  return withTransaction(async (tx) => {
    const appt = await appointmentsRepo.findById(tx, appointmentId, { forUpdate: true });
    if (!appt) throw AppError.notFound('Appointment');
    await assertCanActForProvider(tx, c.user, appt.provider_id, NOTE_AUTHORS[body.note_type]);
    if (!SEEN_STATUSES.includes(appt.status as string)) {
      throw AppError.conflict(
        'VISIT_NOT_STARTED',
        'Notes can be added once the patient has been checked in',
      );
    }
    const id = await repo.insert(tx, appointmentId, c.user.id, body.note_type, body.summary);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'APPOINTMENT_NOTE_ADDED',
      entityType: 'appointment_note',
      entityId: id,
      ip: c.ip,
      metadata: { appointment_id: appointmentId, note_type: body.note_type },
    });
    // A closing note ends the consultation: the visit (appointment) is completed, and so is the
    // care request it belongs to, unless the patient still has a booking pending on it.
    if (body.note_type === 'closing_consultancy') {
      if (appt.status === 'checked_in') {
        assertTransition('appointment', 'checked_in', 'completed');
        await appointmentsRepo.setStatus(tx, appointmentId, 'completed');
      }
      const request = await requestsRepo.findById(tx, appt.care_request_id as number, {
        forUpdate: true,
      });
      const stillBooked = await appointmentsRepo.countActiveForRequest(
        tx,
        appt.care_request_id as number,
      );
      if (
        request &&
        stillBooked === 0 &&
        canTransition('care_request', request.status, 'completed')
      ) {
        await requestsRepo.setStatus(tx, request.id, 'completed');
        await audit(tx, {
          actorUserId: c.user.id,
          action: 'CARE_REQUEST_COMPLETED',
          entityType: 'care_request',
          entityId: request.id,
          ip: c.ip,
          metadata: { closed_by_note: id },
        });
      }
    }
    // Notify the patient there is a new note on their visit (no clinical text in the payload).
    await notifications.notify(tx, [appt.patient_user_id as number], 'appointment_note_added', {
      appointment_id: appointmentId,
    });
    return { id, appointment_id: appointmentId, note_type: body.note_type };
  });
}

/**
 * Notes hold clinical content (prescriptions, referrals), so only the appointment's patient and staff
 * of its clinic may read them. Everyone else gets 404, as if the appointment didn't exist.
 */
export async function listNotes(c: Ctx, appointmentId: number, query: ListAppointmentNotesQuery) {
  const appt = await appointmentsRepo.findById(pool, appointmentId);
  if (!appt) throw AppError.notFound('Appointment');
  const isPatient = c.user.role === 'patient' && appt.patient_user_id === c.user.id;
  const isClinicStaff =
    c.user.role === 'provider_staff' &&
    (await memberProviderIds(pool, c.user.id)).includes(appt.provider_id as number);
  if (!isPatient && !isClinicStaff) throw AppError.notFound('Appointment');
  return repo.findByAppointment(pool, appointmentId, query);
}
