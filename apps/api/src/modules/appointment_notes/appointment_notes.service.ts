import { pool, withTransaction } from '../../db/pool.js';
import { assertCanActForProvider } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import { assertTransition } from '../../lib/stateMachine.js';
import * as notifications from '../notifications/notifications.service.js';
import * as appointmentsRepo from '../appointments/appointments.repo.js';
import * as repo from './appointment_notes.repo.js';
import type {
  CreateAppointmentNoteBody,
  ListAppointmentNotesQuery,
} from './appointment_notes.schema.js';

/**
 * Add a post-visit note to an appointment. Only after the patient has been checked in,
 * and only by the appointment's provider team. Notes are never clinical diagnoses — the
 * platform does not diagnose.
 */
export async function createNote(c: Ctx, appointmentId: number, body: CreateAppointmentNoteBody) {
  return withTransaction(async (tx) => {
    const appt = await appointmentsRepo.findById(tx, appointmentId, { forUpdate: true });
    if (!appt) throw AppError.notFound('Appointment');
    // A note can only be added once the patient has been checked in.
    assertTransition('appointment', appt.status as string, 'checked_in');
    await assertCanActForProvider(tx, c.user, appt.provider_id, [
      'owner',
      'clinician',
      'scheduler',
      'receptionist',
    ]);
    const id = await repo.insert(tx, appointmentId, c.user.id, body.note_type, body.summary);
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'APPOINTMENT_NOTE_ADDED',
      entityType: 'appointment_note',
      entityId: id,
      ip: c.ip,
      metadata: { appointment_id: appointmentId, note_type: body.note_type },
    });
    // Notify the patient there is a new note on their visit (no clinical text in the payload).
    await notifications.notify(tx, [appt.patient_user_id as number], 'appointment_note_added', {
      appointment_id: appointmentId,
    });
    return { id, appointment_id: appointmentId, note_type: body.note_type };
  });
}

export async function listNotes(appointmentId: number, query: ListAppointmentNotesQuery) {
  return repo.findByAppointment(pool, appointmentId, query);
}
