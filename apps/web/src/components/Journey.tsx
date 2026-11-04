import type { RequestStatus } from '../api/types';

const STEPS: { status: RequestStatus; label: string }[] = [
  { status: 'submitted', label: 'Requested' },
  { status: 'matching', label: 'Offers' },
  { status: 'provider_accepted', label: 'Provider' },
  { status: 'assessment', label: 'Assessment' },
  { status: 'treatment_planned', label: 'Plan' },
  { status: 'in_progress', label: 'Treatment' },
  { status: 'completed', label: 'Done' },
];

/** Where a request is in its journey. Cancelled requests show no timeline. */
export function JourneyTimeline({ status }: { status: RequestStatus }) {
  if (status === 'cancelled') return null;
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="timeline" aria-label="Care journey progress">
      {STEPS.map((s, i) => (
        <li
          key={s.status}
          className={i < current ? 'done' : i === current ? 'current' : ''}
          aria-current={i === current ? 'step' : undefined}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}
