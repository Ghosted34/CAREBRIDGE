import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../../api/endpoints';
import type { Appointment } from '../../api/types';
import { AppointmentNotes } from '../../components/AppointmentNotes';
import { FollowUpBooker } from '../../components/FollowUpBooker';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Notice,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { appointmentStatus, appointmentType, requestStatus } from '../../lib/labels';
import { formatDate, formatTimeRange } from '../../lib/time';

const CANCELLABLE = new Set(['requested', 'booked', 'confirmed']);
const CLOSED = new Set(['completed', 'cancelled']);

/** One visit: the problem, every appointment for it, and the clinic's notes after each. */
export function RequestDetailPage() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [followUp, setFollowUp] = useState(false);

  const visit = useQuery({ queryKey: ['requests', id], queryFn: () => api.request(id) });
  const appts = useQuery({
    queryKey: ['appointments', 'mine'],
    queryFn: () => api.myAppointments(),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
  };
  const cancelAppt = useMutation({
    mutationFn: (apptId: number) => api.appointmentAction(apptId, 'cancel'),
    onSuccess: refresh,
  });
  const cancelVisit = useMutation({ mutationFn: () => api.cancelRequest(id), onSuccess: refresh });

  if (visit.isPending) return <Spinner />;
  if (visit.isError) return <ErrorNote error={visit.error} />;
  const v = visit.data.data;
  const status = requestStatus[v.status];
  const mine = (appts.data?.data ?? [])
    .filter((a) => a.care_request_id === id)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const open = !CLOSED.has(v.status);
  const lastCentre = [...mine].reverse().find((a) => a.centre_id)?.centre_id ?? null;
  const hasActive = mine.some((a) => CANCELLABLE.has(a.status) || a.status === 'checked_in');

  return (
    <>
      <PageHeader
        title={v.service_type}
        subtitle={
          <>
            Visit #{v.id} · started {formatDate(v.created_at)}
            {v.assigned_provider && <> · {v.assigned_provider}</>}
          </>
        }
        actions={<Pill tone={status.tone}>{status.label}</Pill>}
      />
      {params.get('booked') && (
        <Notice tone="success">
          Booking request sent. The clinic will confirm it; we'll notify you.
        </Notice>
      )}
      <ErrorNote error={cancelAppt.error ?? cancelVisit.error} />

      <div className="stack gap-4">
        {v.description && v.description !== v.service_type && (
          <Card>
            <h2 className="mb-1">What you told the clinic</h2>
            <p className="note-body">{v.description}</p>
          </Card>
        )}

        <Card>
          <div className="card-head">
            <h2>Appointments</h2>
            {open && lastCentre && !followUp && (
              <Button variant="secondary" className="btn-sm" onClick={() => setFollowUp(true)}>
                Book another appointment
              </Button>
            )}
          </div>
          {appts.isPending ? (
            <Spinner />
          ) : mine.length === 0 ? (
            <EmptyState title="No appointments on this visit" />
          ) : (
            <ul className="list">
              {mine.map((a) => (
                <AppointmentItem
                  key={a.id}
                  a={a}
                  cancelling={cancelAppt.isPending && cancelAppt.variables === a.id}
                  onCancel={() => cancelAppt.mutate(a.id)}
                />
              ))}
            </ul>
          )}
          {followUp && lastCentre && (
            <div className="mt-4">
              <h3 className="mb-2">Another appointment at the same centre</h3>
              <FollowUpBooker
                centreId={lastCentre}
                careRequestId={id}
                onBooked={() => setFollowUp(false)}
              />
            </div>
          )}
        </Card>

        {open && !hasActive && (
          <div className="btn-row">
            <Button
              variant="danger"
              busy={cancelVisit.isPending}
              onClick={() => cancelVisit.mutate()}
            >
              Cancel this visit
            </Button>
          </div>
        )}
        <p>
          <Link to="/patient">← All my visits</Link>
        </p>
      </div>
    </>
  );
}

function AppointmentItem({
  a,
  cancelling,
  onCancel,
}: {
  a: Appointment;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const s = appointmentStatus[a.status];
  const seen = a.status === 'checked_in' || a.status === 'completed';
  return (
    <li className="list-item" style={{ display: 'block' }}>
      <div className="justify-between cluster">
        <div className="list-item-main">
          <div className="list-item-title">
            {formatTimeRange(a.starts_at, a.ends_at)} · {appointmentType[a.appointment_type]}
          </div>
          <div className="meta">
            <span>
              {a.provider}
              {a.centre_name && `, ${a.centre_name}`}
            </span>
            {a.centre_address && <span>{a.centre_address}</span>}
            <span>{a.appointment_mode === 'remote' ? 'Video / voice call' : 'In person'}</span>
            {a.caregiver_name && <span>with {a.caregiver_name}</span>}
          </div>
          {s.hint && <div className="small muted">{s.hint}</div>}
        </div>
        <div className="cluster gap-2">
          <Pill tone={s.tone}>{s.label}</Pill>
          {CANCELLABLE.has(a.status) && (
            <Button variant="ghost" className="btn-sm" busy={cancelling} onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      {seen && (
        <div className="mt-2">
          <AppointmentNotes appointmentId={a.id} />
        </div>
      )}
    </li>
  );
}
