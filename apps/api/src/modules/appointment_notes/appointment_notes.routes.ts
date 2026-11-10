import { Router } from 'express';
import { created, ctx, ok } from '../../lib/http.js';
import { IdParam, parse } from '../../lib/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { AddAppointmentNoteBody } from './appointment_notes.schema.js';
import * as service from './appointment_notes.service.js';

export const appointmentNotesRouter = Router();

appointmentNotesRouter.get('/appointments/:id/notes', authenticate, async (req, res) => {
  ok(res, await service.listNotes(ctx(req), parse(IdParam, req.params).id));
});

appointmentNotesRouter.post('/appointments/:id/notes', authenticate, async (req, res) => {
  created(
    res,
    await service.addNote(
      ctx(req),
      parse(IdParam, req.params).id,
      parse(AddAppointmentNoteBody, req.body),
    ),
  );
});
