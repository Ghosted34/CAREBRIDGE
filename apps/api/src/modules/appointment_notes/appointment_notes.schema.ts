import { z } from 'zod';

export const AddAppointmentNoteBody = z.object({
  note_type: z.enum(['follow_up', 'referral', 'prescription', 'consultation_closed']),
  notes: z.string().trim().min(1).max(4000),
});
export type AddAppointmentNoteBody = z.infer<typeof AddAppointmentNoteBody>;
