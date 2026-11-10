import { z } from 'zod';
import { Pagination } from '../../lib/validate.js';

export const CreateAppointmentNoteBody = z.object({
  note_type: z.enum(['follow_up', 'referral', 'prescription', 'closing_consultancy']),
  /** Plain-language summary for the patient. No clinical diagnosis. */
  summary: z.string().trim().min(1).max(2000),
});
export type CreateAppointmentNoteBody = z.infer<typeof CreateAppointmentNoteBody>;

export const ListAppointmentNotesQuery = Pagination;
export type ListAppointmentNotesQuery = z.infer<typeof ListAppointmentNotesQuery>;
