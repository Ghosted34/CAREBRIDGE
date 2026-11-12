import { Router } from 'express';
import { ctx, list, ok } from '../../lib/http.js';
import { IdParam, parse } from '../../lib/validate.js';
import { allow, authenticate } from '../../middleware/auth.js';
import {
  CreateAppointmentNoteBody,
  ListAppointmentNotesQuery,
} from './appointment_notes.schema.js';
import * as service from './appointment_notes.service.js';

export const appointmentNotesRouter = Router();

appointmentNotesRouter.get('/appointments/:id/notes', authenticate, async (req, res) => {
  const { id } = parse(IdParam, req.params);
  const q = parse(ListAppointmentNotesQuery, req.query);
  list(res, await service.listNotes(ctx(req), id, q), q);
});

appointmentNotesRouter.post(
  '/appointments/:id/notes',
  authenticate,
  allow('provider_staff'),
  async (req, res) => {
    const { id } = parse(IdParam, req.params);
    ok(res, await service.createNote(ctx(req), id, parse(CreateAppointmentNoteBody, req.body)));
  },
);
