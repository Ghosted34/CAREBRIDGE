import { z } from 'zod';
import { Pagination } from '../../lib/validate.js';

/** `GET /appointments/mine` — staff may scope the list to one of their clinics. */
export const MineQuery = Pagination.extend({
  provider_id: z.coerce.number().int().positive().optional(),
});
export type MineQuery = z.infer<typeof MineQuery>;

export const BookAppointmentBody = z.object({
  care_request_id: z.number().int().positive(),
  // Provider/facility the patient is booking with (patient picks directly, no offer round).
  // Optional: if omitted, the care request's assigned provider is used.
  provider_id: z.number().int().positive().optional(),
  // Which operating centre of the provider the visit happens at.
  centre_id: z.number().int().positive().nullish().default(null),
  // ISO-8601 with an explicit offset or Z, e.g. 2026-11-10T09:00:00+01:00
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  appointment_type: z.enum(['assessment', 'specialist', 'diagnostic', 'procedure', 'follow_up']),
  // physical (in-person at a centre) or remote (video/voice).
  appointment_mode: z.enum(['physical', 'remote']).default('physical'),
  slot_id: z.number().int().positive().optional(),
  // Optionally request a specific caregiver at the centre.
  caregiver_id: z.number().int().positive().optional(),
});
