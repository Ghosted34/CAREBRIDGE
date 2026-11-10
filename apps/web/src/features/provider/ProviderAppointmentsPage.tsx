import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, type AppointmentVerb } from '../../api/endpoints';
import type { Appointment, AppointmentNote } from '../../api/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { appointmentMode, appointmentStatus, appointmentType } from '../../lib/labels';
import { formatDateTime } from '../../lib/time';
import { useActiveClinic } from './activeClinic';

const ACTIONS: Partial<
  Record<
    Appointment['status'],
    {
      verb: 'confirm' | 'check-in' | 'complete' | 'no-show' | 'cancel';
      label: string;
      variant?: 'ghost' | 'danger';
    }[]
  >
> = {
  booked: [
    { verb: 'confirm', label: 'Confirm' },
    { verb: 'cancel', label: 'Cancel', variant: 'danger' },
  ],
  confirmed: [
    { verb: 'check-in', label: 'Check in' },
    { verb: 'no-show', label: 'No-show', variant: 'ghost' },
    { verb: 'cancel', label: 'Cancel', variant: 'danger' },
  ],
  checked_in: [{ verb: 'complete', label: 'Complete' }],
};

const NOTE_TYPES: Array<{
  value: AppointmentNote['note_type'];
  label: string;
}> = [
  { value: 'follow_up', label: 'Follow-up plan' },
  { value: 'referral', label: 'Referral for further diagnosis' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'consultation_closed', label: 'Close consultation' },
];

export function ProviderAppointmentsPage() {
  const queryClient = useQueryClient();
  const { clinicId } = useActiveClinic();
  const q = useQuery({
    queryKey: ['appointments', 'mine', clinicId],
    queryFn: () => api.myAppointments({ provider_id: clinicId }),
  });
  const act = useMutation({
    mutationFn: ({ id, verb }: { id: number; verb: AppointmentVerb }) =>
      api.appointmentAction(id, verb),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const [noteFor, setNoteFor] = useState<Appointment | null>(null);
  const [noteTypeValue, setNoteTypeValue] = useState<AppointmentNote['note_type']>('follow_up');
  const [noteText, setNoteText] = useState('');
  const addNote = useMutation({
    mutationFn: () =>
      api.addAppointmentNote(noteFor!.id, {
        note_type: noteTypeValue,
        notes: noteText,
      }),
    onSuccess: () => {
      setNoteFor(null);
      setNoteText('');
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  return (
    <>
      <PageHeader title="Appointments" subtitle="All times are Lagos time." />
      <ErrorNote error={act.error} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="No appointments yet" />
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Patient</th>
                  <th>Centre</th>
                  <th>Type</th>
                  <th>Mode</th>
                  <th>Caregiver</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {q.data.data.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDateTime(a.starts_at)}</td>
                    <td>
                      {a.patient_name}
                      <div className="muted small">Request #{a.care_request_id}</div>
                    </td>
                    <td>{a.centre ?? '—'}</td>
                    <td>{appointmentType[a.appointment_type]}</td>
                    <td>
                      <Pill tone={appointmentMode[a.appointment_mode].tone}>
                        {appointmentMode[a.appointment_mode].label}
                      </Pill>
                    </td>
                    <td>{a.caregiver ?? '—'}</td>
                    <td>
                      <Pill tone={appointmentStatus[a.status].tone}>
                        {appointmentStatus[a.status].label}
                      </Pill>
                    </td>
                    <td>
                      <div className="btn-row">
                        {(ACTIONS[a.status] ?? []).map((x) => (
                          <Button
                            key={x.verb}
                            variant={x.variant ?? 'secondary'}
                            className="btn-sm"
                            busy={
                              act.isPending &&
                              act.variables?.id === a.id &&
                              act.variables.verb === x.verb
                            }
                            onClick={() => act.mutate({ id: a.id, verb: x.verb })}
                          >
                            {x.label}
                          </Button>
                        ))}
                        {(a.status === 'checked_in' || a.status === 'completed') && (
                          <Button
                            variant="ghost"
                            className="btn-sm"
                            busy={addNote.isPending}
                            onClick={() => setNoteFor(a)}
                          >
                            Add note
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={!!noteFor}
        title={`Add consultation note · #{noteFor?.care_request_id ?? ''}`}
        onClose={() => setNoteFor(null)}
      >
        {noteFor && (
          <form
            className="form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              addNote.mutate();
            }}
          >
            <p className="hint">
              Notes can only be added after the patient has been checked in. They are shared with
              the patient and never appear in public logs.
            </p>
            <Field label="Note type">
              <select
                value={noteTypeValue}
                onChange={(e) => setNoteTypeValue(e.target.value as AppointmentNote['note_type'])}
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" hint="Follow-up plan, referral, prescription, or closing summary.">
              <textarea
                rows={3}
                required
                maxLength={4000}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </Field>
            <ErrorNote error={addNote.error} />
            <div className="btn-row">
              <Button type="button" variant="ghost" onClick={() => setNoteFor(null)}>
                Cancel
              </Button>
              <Button type="submit" busy={addNote.isPending} disabled={!noteText.trim()}>
                Save note
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
