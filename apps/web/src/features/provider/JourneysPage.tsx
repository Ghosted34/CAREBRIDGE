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
  const [estimateFor, setEstimateFor] = useState<AssignedRequest | null>(null);
  const [referralFor, setReferralFor] = useState<AssignedRequest | null>(null);

  // Form states
  const [estAmount, setEstAmount] = useState(25000);
  const [estInclusions, setEstInclusions] = useState('Consultation, digital X-rays, treatment');
  const [estExclusions, setEstExclusions] = useState('Prescription medication');

  const [refSpecialty, setRefSpecialty] = useState('Endodontics');
  const [refSummary, setRefSummary] = useState('');
  const [refProviderId, setRefProviderId] = useState<number>(2);

  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['requests', 'assigned', status],
    queryFn: () => api.assigned({ status: status || undefined }),
  });
  const providersQuery = useQuery({
    queryKey: ['providers'],
    queryFn: () => api.providers(),
  });

  const progress = useMutation({
    mutationFn: ({ id, step }: { id: number; step: JourneyStep }) => api.progressRequest(id, step),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['requests'] }),
  });

  const issueEstimate = useMutation({
    mutationFn: () =>
      api.createEstimate(estimateFor!.id, {
        amount: estAmount,
        currency: 'NGN',
        inclusions: estInclusions,
        exclusions: estExclusions,
      }),
    onSuccess: () => {
      setEstimateFor(null);
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  const createReferral = useMutation({
    mutationFn: () =>
      api.createReferral(referralFor!.id, {
        receiving_provider_id: refProviderId,
        referred_specialty: refSpecialty,
        clinical_summary: refSummary,
      }),
    onSuccess: () => {
      setReferralFor(null);
      void queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
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
                  <>
                    <Button variant="secondary" onClick={() => setBooking(r)}>
                      Book appointment
                    </Button>
                    <Button variant="ghost" onClick={() => setEstimateFor(r)}>
                      Issue estimate
                    </Button>
                    <Button variant="ghost" onClick={() => setReferralFor(r)}>
                      Refer patient
                    </Button>
                  </>
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

      <Modal
        open={!!estimateFor}
        title={`Issue Cost Estimate for Request #${estimateFor?.id ?? ''}`}
        onClose={() => setEstimateFor(null)}
      >
        <div className="stack gap-3">
          <p className="hint">
            Provide transparent pricing before clinical treatment begins. The patient will review
            and approve.
          </p>
          <Field label="Amount (NGN)">
            <input
              type="number"
              min={1000}
              max={10000000}
              step={1000}
              value={estAmount}
              onChange={(e) => setEstAmount(Number(e.target.value))}
            />
          </Field>
          <Field label="Inclusions">
            <textarea
              rows={2}
              value={estInclusions}
              onChange={(e) => setEstInclusions(e.target.value)}
            />
          </Field>
          <Field label="Exclusions">
            <textarea
              rows={2}
              value={estExclusions}
              onChange={(e) => setEstExclusions(e.target.value)}
            />
          </Field>
          <ErrorNote error={issueEstimate.error} />
          <div className="btn-row">
            <Button variant="ghost" onClick={() => setEstimateFor(null)}>
              Cancel
            </Button>
            <Button busy={issueEstimate.isPending} onClick={() => issueEstimate.mutate()}>
              Issue estimate
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!referralFor}
        title={`Refer Patient #${referralFor?.id ?? ''} to Specialist`}
        onClose={() => setReferralFor(null)}
      >
        <div className="stack gap-3">
          <p className="hint">
            Initiate clinician-to-clinician handoff. Clinical summaries stay strictly out of server
            logs.
          </p>
          <Field label="Receiving Clinic / Specialist">
            <select
              value={refProviderId}
              onChange={(e) => setRefProviderId(Number(e.target.value))}
            >
              {(providersQuery.data?.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.city})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Referred Specialty">
            <input
              type="text"
              required
              value={refSpecialty}
              onChange={(e) => setRefSpecialty(e.target.value)}
            />
          </Field>
          <Field label="Clinical Summary & Handover Notes">
            <textarea
              rows={3}
              required
              placeholder="Detailed clinical findings, diagnostic notes, reason for referral..."
              value={refSummary}
              onChange={(e) => setRefSummary(e.target.value)}
            />
          </Field>
          <ErrorNote error={createReferral.error} />
          <div className="btn-row">
            <Button variant="ghost" onClick={() => setReferralFor(null)}>
              Cancel
            </Button>
            <Button
              busy={createReferral.isPending}
              disabled={!refSummary.trim()}
              onClick={() => createReferral.mutate()}
            >
              Send referral
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
