import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type JourneyStep } from '../../api/endpoints';
import type { AssignedRequest, RequestStatus } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import { BookingForm } from '../../components/BookingForm';
import { JourneyTimeline } from '../../components/Journey';
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
import { requestStatus, titleCase, urgency } from '../../lib/labels';
import { formatDateTime } from '../../lib/time';

/** The next clinical step a provider can take from each status. */
const NEXT: Partial<Record<RequestStatus, { step: JourneyStep; label: string }[]>> = {
  provider_accepted: [{ step: 'start-assessment', label: 'Start assessment' }],
  assessment: [
    { step: 'plan-treatment', label: 'Treatment planned' },
    { step: 'complete', label: 'Complete (no treatment needed)' },
  ],
  treatment_planned: [{ step: 'start-treatment', label: 'Start treatment' }],
  in_progress: [{ step: 'complete', label: 'Mark completed' }],
};
const BOOKABLE: RequestStatus[] = [
  'provider_accepted',
  'assessment',
  'treatment_planned',
  'in_progress',
];

export function JourneysPage() {
  const { user } = useAuth();
  const isOps = user?.role !== 'provider_staff';
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const [booking, setBooking] = useState<AssignedRequest | null>(null);
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['requests', 'assigned', status],
    queryFn: () => api.assigned({ status: status || undefined }),
  });
  const progress = useMutation({
    mutationFn: ({ id, step }: { id: number; step: JourneyStep }) => api.progressRequest(id, step),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['requests'] }),
  });

  return (
    <>
      <PageHeader
        title={isOps ? 'Patient journeys' : 'My patients'}
        subtitle={
          isOps
            ? 'Every request that has a provider, newest activity first.'
            : 'Patients who chose your clinic.'
        }
        actions={
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as RequestStatus | '')}
            >
              <option value="">All active and past</option>
              {(
                [
                  'provider_accepted',
                  'assessment',
                  'treatment_planned',
                  'in_progress',
                  'completed',
                  'cancelled',
                ] as const
              ).map((s) => (
                <option key={s} value={s}>
                  {requestStatus[s].label}
                </option>
              ))}
            </select>
          </Field>
        }
      />
      <ErrorNote error={progress.error} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="Nothing here yet">
          When a patient chooses your offer they’ll appear here.
        </EmptyState>
      ) : (
        <div className="stack">
          {q.data.data.map((r) => (
            <Card key={r.id}>
              <div className="card-head">
                <div>
                  <h3>
                    {r.patient_name} · {r.service_type}
                  </h3>
                  <div className="meta">
                    <span>#{r.id}</span>
                    <span>{titleCase(r.specialty)}</span>
                    <a href={`tel:${r.patient_phone.replace(/\s/g, '')}`}>{r.patient_phone}</a>
                    {isOps && <span>at {r.assigned_provider}</span>}
                    <span>Updated {formatDateTime(r.updated_at)}</span>
                  </div>
                </div>
                <div className="btn-row">
                  <Pill tone={urgency[r.urgency].tone}>{urgency[r.urgency].label}</Pill>
                  <Pill tone={requestStatus[r.status].tone}>{requestStatus[r.status].label}</Pill>
                </div>
              </div>
              <JourneyTimeline status={r.status} />
              <details style={{ marginTop: 8 }}>
                <summary className="small muted">Patient’s description</summary>
                <div className="quote">{r.description}</div>
              </details>
              <div className="btn-row" style={{ marginTop: 12 }}>
                {(NEXT[r.status] ?? []).map((n, i) => (
                  <Button
                    key={n.step}
                    variant={i === 0 ? 'primary' : 'ghost'}
                    busy={
                      progress.isPending &&
                      progress.variables?.id === r.id &&
                      progress.variables.step === n.step
                    }
                    onClick={() => progress.mutate({ id: r.id, step: n.step })}
                  >
                    {n.label}
                  </Button>
                ))}
                {BOOKABLE.includes(r.status) && (
                  <Button variant="secondary" onClick={() => setBooking(r)}>
                    Book appointment
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={!!booking}
        title={`Book for ${booking?.patient_name ?? ''}`}
        onClose={() => setBooking(null)}
      >
        {booking && <BookingForm careRequestId={booking.id} onBooked={() => setBooking(null)} />}
      </Modal>
    </>
  );
}
