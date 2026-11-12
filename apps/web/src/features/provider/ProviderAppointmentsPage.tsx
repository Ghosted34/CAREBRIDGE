import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { api, type AppointmentVerb } from '../../api/endpoints';
import type { Appointment, AppointmentStatus, NoteType } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import { AppointmentNotes } from '../../components/AppointmentNotes';
import { FollowUpBooker } from '../../components/FollowUpBooker';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Notice,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { appointmentStatus, appointmentType, noteAuthors, noteType } from '../../lib/labels';
import { formatTimeRange } from '../../lib/time';
import { useActiveClinic } from './activeClinic';

const ACTIONS: Partial<
  Record<
    AppointmentStatus,
    { verb: AppointmentVerb; label: string; variant?: 'ghost' | 'danger' }[]
  >
> = {
  requested: [
    { verb: 'confirm', label: 'Confirm' },
    { verb: 'decline', label: 'Decline', variant: 'danger' },
  ],
  booked: [
    { verb: 'confirm', label: 'Confirm' },
    { verb: 'cancel', label: 'Cancel', variant: 'danger' },
  ],
  confirmed: [
    { verb: 'check-in', label: 'Check in' },
    { verb: 'no-show', label: 'No-show', variant: 'ghost' },
    { verb: 'cancel', label: 'Cancel', variant: 'danger' },
  ],
};

const TABS = {
  confirm: { label: 'To confirm', statuses: ['requested', 'booked'] },
  upcoming: { label: 'Confirmed', statuses: ['confirmed'] },
  in_clinic: { label: 'Checked in', statuses: ['checked_in'] },
  past: { label: 'Past', statuses: ['completed', 'no_show', 'cancelled'] },
} satisfies Record<string, { label: string; statuses: AppointmentStatus[] }>;
type Tab = keyof typeof TABS;

/**
 * The clinic's bookings, by what needs doing: confirm requests, check patients in (or mark no-show),
 * then write the outcome as notes — prescription, referral, follow-up or closing the visit.
 */
export function ProviderAppointmentsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { clinicId } = useActiveClinic();
  const role = user?.memberships.find((m) => m.provider_id === clinicId)?.provider_role;
  const [tab, setTab] = useState<Tab | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  // A newly verified clinic has no centre yet, so patients can't find it: point the way.
  const centres = useQuery({
    queryKey: ['centres', clinicId],
    queryFn: () => api.centres(clinicId!),
    enabled: Boolean(clinicId),
  });
  const noCentres = centres.isSuccess && centres.data.data.length === 0;
  const q = useQuery({
    queryKey: ['appointments', 'mine', clinicId],
    queryFn: () => api.myAppointments({ provider_id: clinicId }),
  });
  const act = useMutation({
    mutationFn: ({ id, verb }: { id: number; verb: AppointmentVerb }) =>
      api.appointmentAction(id, verb),
    onSuccess: (_r, { id, verb }) => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      if (verb === 'check-in') {
        // Follow the patient to "Checked in" with the notes form open.
        setTab('in_clinic');
        setOpenId(id);
      }
    },
  });

  const all = q.data?.data ?? [];
  const count = (t: Tab) =>
    all.filter((a) => (TABS[t].statuses as string[]).includes(a.status)).length;
  const active: Tab =
    tab ?? (count('confirm') > 0 ? 'confirm' : count('in_clinic') > 0 ? 'in_clinic' : 'upcoming');
  const rows = all
    .filter((a) => (TABS[active].statuses as string[]).includes(a.status))
    .sort((a, b) =>
      active === 'past'
        ? b.starts_at.localeCompare(a.starts_at)
        : a.starts_at.localeCompare(b.starts_at),
    );

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Confirm requests, check patients in, add notes. Lagos time."
      />
      {noCentres && (
        <Notice tone="warn">
          Patients can't find your clinic yet: it has no centre.{' '}
          <Link to="/provider/capacity">
            {role === 'owner' ? 'Add your first centre and its opening hours' : 'Centres & hours'}
          </Link>
          {role !== 'owner' && ' — the clinic owner adds centres.'}
        </Notice>
      )}
      <div className="tabs" role="group" aria-label="Filter bookings">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className="tab"
            aria-pressed={active === t}
            onClick={() => setTab(t)}
          >
            {TABS[t].label} ({count(t)})
          </button>
        ))}
      </div>
      <ErrorNote error={act.error} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : rows.length === 0 ? (
        <EmptyState title={`Nothing in “${TABS[active].label}”`} />
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Patient</th>
                  <th>Where</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const seen = a.status === 'checked_in' || a.status === 'completed';
                  return (
                    <Fragment key={a.id}>
                      <tr>
                        <td>
                          {formatTimeRange(a.starts_at, a.ends_at)}
                          <div className="muted small">
                            {appointmentType[a.appointment_type]} ·{' '}
                            {a.appointment_mode === 'remote' ? 'remote' : 'in person'}
                          </div>
                        </td>
                        <td>
                          {a.patient_name}
                          <div className="muted small">Visit #{a.care_request_id}</div>
                        </td>
                        <td>
                          {a.centre_name ?? a.provider}
                          {a.caregiver_name && (
                            <div className="muted small">{a.caregiver_name}</div>
                          )}
                        </td>
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
                            {seen && (
                              <Button
                                variant="secondary"
                                className="btn-sm"
                                aria-expanded={openId === a.id}
                                onClick={() => setOpenId(openId === a.id ? null : a.id)}
                              >
                                {openId === a.id ? 'Hide notes' : 'Notes'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {seen && openId === a.id && (
                        <tr>
                          <td colSpan={5}>
                            <VisitOutcome appointment={a} role={role} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/** After check-in: the notes so far, a form to add one, and booking a follow-up. */
function VisitOutcome({ appointment: a, role }: { appointment: Appointment; role?: string }) {
  const queryClient = useQueryClient();
  const allowed = (Object.keys(noteType) as NoteType[]).filter((t) =>
    role ? (noteAuthors[t] as string[]).includes(role) : false,
  );
  const [type, setType] = useState<NoteType | ''>('');
  const [summary, setSummary] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const add = useMutation({
    mutationFn: () => api.addAppointmentNote(a.id, { note_type: type as NoteType, summary }),
    onSuccess: () => {
      setSummary('');
      setFollowUp(type === 'follow_up');
      setType('');
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  return (
    <div className="stack gap-3 p-2">
      <AppointmentNotes appointmentId={a.id} />
      {allowed.length === 0 ? (
        <Notice>Your role can't add notes. Ask a dentist or the clinic owner.</Notice>
      ) : (
        <form
          className="form"
          aria-label={`Add a note for ${a.patient_name}`}
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <fieldset className="span-2">
            <legend>Add a note</legend>
            <div className="choice-row">
              {allowed.map((t) => (
                <label key={t} className="choice" title={noteType[t].hint}>
                  <input
                    type="radio"
                    name={`note-type-${a.id}`}
                    required
                    checked={type === t}
                    onChange={() => setType(t)}
                  />
                  {noteType[t].label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            label="Note for the patient"
            hint={
              type === 'closing_consultancy'
                ? 'Closes the visit and marks this appointment completed.'
                : 'The patient can read this.'
            }
            className="span-2"
          >
            <textarea
              rows={3}
              required
              maxLength={2000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <ErrorNote error={add.error} />
          <div className="btn-row">
            <Button type="submit" busy={add.isPending} disabled={!type || !summary.trim()}>
              Save note
            </Button>
            {a.centre_id && !followUp && (
              <Button variant="ghost" onClick={() => setFollowUp(true)}>
                Book a follow-up
              </Button>
            )}
          </div>
        </form>
      )}
      {followUp && a.centre_id && (
        <div>
          <h3 className="mb-2">Follow-up for {a.patient_name}</h3>
          <FollowUpBooker centreId={a.centre_id} careRequestId={a.care_request_id} />
        </div>
      )}
    </div>
  );
}
