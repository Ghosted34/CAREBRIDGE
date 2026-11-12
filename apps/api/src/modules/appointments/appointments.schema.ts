import { PROBLEM_KEYS } from '../availability/problems.js';
import { z } from 'zod';
import { Pagination } from '../../lib/validate.js';

/** `GET /appointments/mine` — staff may scope the list to one of their clinics. */
export const MineQuery = Pagination.extend({
  provider_id: z.coerce.number().int().positive().optional(),
});
export type MineQuery = z.infer<typeof MineQuery>;

/**
 * A booking request. Patients book a FREE time at a centre (from /search or a centre's availability);
 * the server checks it is still free and sets the end time from the clinic's slot length.
 * New visit: give `problem` (and answer the emergency question). Follow-up on an existing visit:
 * give `care_request_id` instead — clinic staff may book follow-ups for their patient.
 */
export const BookAppointmentBody = z
  .object({
    centre_id: z.number().int().positive(),
    // ISO-8601 with an explicit offset or Z, e.g. 2026-11-12T09:00:00+01:00
    starts_at: z.iso.datetime({ offset: true }),
    appointment_mode: z.enum(['physical', 'remote']).default('physical'),
    caregiver_id: z.number().int().positive().optional(),
    // New visit:
    problem: z.enum(PROBLEM_KEYS).optional(),
    /** The patient's own words about the problem (clinical text: never logged). */
    details: z.string().trim().max(2000).optional(),
    has_emergency_symptoms: z.boolean().optional(),
    // Follow-up on an existing visit:
    care_request_id: z.number().int().positive().optional(),
  })
  .refine((b) => (b.care_request_id ? !b.problem : !!b.problem), {
    message: 'Give either problem (new visit) or care_request_id (follow-up), not both',
    path: ['problem'],
  })
  .refine((b) => b.care_request_id || b.has_emergency_symptoms !== undefined, {
    message: 'Answer the emergency question for a new visit',
    path: ['has_emergency_symptoms'],
  });
