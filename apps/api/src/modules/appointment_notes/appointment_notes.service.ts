import type { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { assertCanActForProvider } from '../../lib/access.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import * as appointmentsRepo from '../appointments/appointments.repo.js';
import * as notifications from '../notifications/notifications.service.js';
import type { AddAppointmentNoteBody } from './appointment_notes.schema.js';
import * as repo from './appointment_notes.repo.js';

/**
 * Consultancy notes are added after the patient has been seen (checked in or completed):
 * follow-up plan, referral for further diagnosis, prescriptions, or closing the consultancy.
 * The note text itself is clinical-adjacent information: it is audited by ID only and never
 * placed in a notification payload.
 */
export async function addNote(
  c: Ctx,
  appointmentId: number,
  body: z.infer<typeof AddAppointmentNoteBody>,
) {
  return withTransaction(async (tx) => {
    const appt = await appointmentsRepo.findById(tx, appointmentId, { forUpdate: true });
    if (!appt) throw AppError.notFound('Appointment');
    if (c.user.role === 'patient')
      throw AppError.forbidden('Only the provider can add consultation notes');
    await assertCanActForProvider(tx, c.user, appt.provider_id);
    if (!['checked_in', 'completed'].includes(appt.status)) {
      throw AppError.conflict(
        'NOT_CHECKED_IN',
        'Notes can only be added after the patient has been checked in.',
      );
    }
    const id = await repo.insert(tx, {
      appointment_id: appointmentId,
      note_type: body.note_type,
      notes: body.notes,
      created_by_user_id: c.user.id,
    });
    await audit(tx, {
      actorUserId: c.user.id,
      action: 'APPOINTMENT_NOTES_ADDED',
      entityType: 'appointment',
      entityId: id,
      ip: c.ip,
      metadata: { appointment_id: appointmentId, note_type: body.note_type },
    });
    await notifications.notify(tx, [appt.patient_user_id], 'appointment_notes_added', {
      request_id: appt.care_request_id as number,
      appointment_id: id,
      provider: appt.provider as string,
      starts_at: new Date(appt.starts_at).toISOString(),
    });
    return repo.findById(tx, id);
  });
}

/** The patient, the appointment's provider team, or platform staff may read the notes. */
export async function listNotes(c: Ctx, appointmentId: number) {
  const appt = await appointmentsRepo.findById(pool, appointmentId);
  if (!appt) throw AppError.notFound('Appointment');
  if (c.user.role === 'patient') {
    if (appt.patient_user_id !== c.user.id) throw AppError.notFound('Appointment');
  } else if (c.user.role === 'provider_staff') {
    await assertCanActForProvider(pool, c.user, appt.provider_id);
  }
  return repo.listByAppointment(pool, appointmentId);
}
