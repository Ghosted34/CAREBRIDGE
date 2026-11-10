import { z } from 'zod';
import { Pagination } from '../../lib/validate.js';

/** `GET /appointments/mine` — staff may scope the list to one of their clinics. */
export const MineQuery = Pagination.extend({
  provider_id: z.coerce.number().int().positive().optional(),
});
export type MineQuery = z.infer<typeof MineQuery>;

export const BookAppointmentBody = z.object({
  care_request_id: z.number().int().positive(),
  // ISO-8601 with an explicit offset or Z, e.g. 2026-11-10T09:00:00+01:00
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  appointment_type: z.enum(['assessment', 'specialist', 'diagnostic', 'procedure', 'follow_up']),
  /** Which operating centre of the provider the visit happens at. */
  centre_id: z.number().int().positive(),
  /** Book with a specific caregiver of that centre, or leave open for the clinic to assign. */
  caregiver_user_id: z.number().int().positive().optional(),
  /** Physical visit or a remote video/voice call. */
  appointment_mode: z.enum(['physical', 'video_call', 'voice_call']).default('physical'),
  slot_id: z.number().int().positive().optional(),
});
