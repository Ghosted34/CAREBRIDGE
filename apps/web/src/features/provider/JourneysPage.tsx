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
  NumberField,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { requestStatus, titleCase, urgency } from '../../lib/labels';
import { formatDateTime } from '../../lib/time';
import { useActiveClinic } from './activeClinic';

/**
 * The next clinical step a provider can take from each status. `needsVisit` steps are gated on
 * the patient having been seen (an appointment checked in or completed) — clinical governance;
 * the API refuses them with 409 VISIT_REQUIRED until then.
 */
const NEXT: Partial<
  Record<RequestStatus, { step: JourneyStep; label: string; needsVisit?: boolean }[]>
> = {
  provider_accepted: [{ step: 'start-assessment', label: 'Start assessment' }],
  assessment: [
    { step: 'plan-treatment', label: 'Treatment planned', needsVisit: true },
    { step: 'complete', label: 'Complete (no treatment needed)' },
  ],
  treatment_planned: [{ step: 'start-treatment', label: 'Start treatment', needsVisit: true }],
  in_progress: [{ step: 'complete', label: 'Mark completed' }],
};
const BOOKABLE: RequestStatus[] = [
  'provider_accepted',
  'assessment',
  'treatment_planned',
  'in_progress',
];
/** Statuses where a post-visit action (estimate, referral) is offered at all. */
const GOVERNED: RequestStatus[] = ['assessment', 'treatment_planned', 'in_progress'];

/** Clinical governance: has the patient been seen for this request yet? */
const seen = (r: AssignedRequest) => Number(r.assessments_completed ?? 0) > 0;
const VISIT_HINT = 'Available once the patient has been seen (appointment checked in or completed)';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * An action that only exists after the first visit. Disabled (with the reason) rather than hidden
 * so staff can see what comes next; the API refuses it too, with 409 VISIT_REQUIRED.
 */
function GovernedButton({
  label,
  visited,
  required = true,
  variant = 'ghost',
  busy,
  onClick,
}: {
  label: string;
  visited: boolean;
  required?: boolean;
  variant?: ButtonVariant;
  busy?: boolean;
  onClick: () => void;
}) {
  const blocked = required && !visited;
  return (
    <span title={blocked ? VISIT_HINT : undefined}>
      <Button variant={variant} busy={busy} disabled={blocked} onClick={onClick}>
        {label}
      </Button>
    </span>
  );
}

export function JourneysPage() {
  const { user } = useAuth();
  const isOps = user?.role !== 'provider_staff';
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const [booking, setBooking] = useState<AssignedRequest | null>(null);
  const [estimateFor, setEstimateFor] = useState<AssignedRequest | null>(null);
  const [referralFor, setReferralFor] = useState<AssignedRequest | null>(null);

  // Form states (money is edited as text so the field can be cleared and formatted)
  const [estAmount, setEstAmount] = useState('25000');
  const [estInclusions, setEstInclusions] = useState('Consultation, digital X-rays, treatment');
  const [estExclusions, setEstExclusions] = useState('Prescription medication');

  const [refSpecialty, setRefSpecialty] = useState('Endodontics');
  const [refSummary, setRefSummary] = useState('');
  const [refProviderId, setRefProviderId] = useState<number | ''>('');

  const queryClient = useQueryClient();
  const { clinicId } = useActiveClinic();
  const q = useQuery({
    queryKey: ['requests', 'assigned', status, clinicId],
    queryFn: () => api.assigned({ status: status || undefined, provider_id: clinicId }),
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
        amount: Number(estAmount.replace(/[^0-9.]/g, '')),
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
        receiving_provider_id: Number(refProviderId),
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
                  <GovernedButton
                    key={n.step}
                    label={n.label}
                    variant={i === 0 ? 'primary' : 'ghost'}
                    visited={seen(r)}
                    required={!!n.needsVisit}
                    busy={
                      progress.isPending &&
                      progress.variables?.id === r.id &&
                      progress.variables.step === n.step
                    }
                    onClick={() => progress.mutate({ id: r.id, step: n.step })}
                  />
                ))}
                {BOOKABLE.includes(r.status) && (
                  <Button variant="secondary" onClick={() => setBooking(r)}>
                    Book appointment
                  </Button>
                )}
                {GOVERNED.includes(r.status) && (
                  <>
                    <GovernedButton
                      label="Issue estimate"
                      variant="ghost"
                      visited={seen(r)}
                      onClick={() => setEstimateFor(r)}
                    />
                    <GovernedButton
                      label="Refer patient"
                      variant="ghost"
                      visited={seen(r)}
                      onClick={() => setReferralFor(r)}
                    />
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
          <Field label="Amount (NGN)" hint="Whole naira, at least 1,000.">
            <NumberField value={estAmount} onValueChange={setEstAmount} max={10_000_000} required />
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
            <Button
              busy={issueEstimate.isPending}
              disabled={!estAmount || Number(estAmount) < 1000}
              onClick={() => issueEstimate.mutate()}
            >
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
              required
              value={refProviderId}
              onChange={(e) => setRefProviderId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Choose a clinic…</option>
              {(providersQuery.data?.data ?? [])
                .filter((p) => p.id !== referralFor?.assigned_provider_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} ({p.city})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Referred specialty">
            <input
              required
              maxLength={100}
              placeholder="e.g. Endodontics"
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
              disabled={!refSummary.trim() || !refProviderId}
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
