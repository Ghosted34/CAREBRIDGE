import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/endpoints';
import type {
  AppointmentMode,
  FreeTime,
  SearchPeriod,
  SearchResponse,
  SearchResult,
} from '../../api/types';
import { ModeChoice } from '../../components/FollowUpBooker';
import { newPeriod } from '../../lib/periods';
import { PeriodFields } from '../../components/PeriodFields';
import { TimePicker } from '../../components/TimePicker';
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
import { areaMatch, money, titleCase } from '../../lib/labels';
import { addDays, formatDateTime } from '../../lib/time';

const MAX_PERIODS = 5;

/**
 * The MVP booking flow: pick the problem and when you're free → see clinics near you that treat it,
 * with their free times inside those periods → pick a time → send the booking request. The clinic
 * then confirms it. `?providerId=` (from the public directory) narrows results to one clinic.
 */
export function BookPage() {
  const [params] = useSearchParams();
  const onlyProvider = Number(params.get('providerId')) || null;
  const [problem, setProblem] = useState('');
  const [periods, setPeriods] = useState<SearchPeriod[]>(() => [newPeriod()]);
  const [elsewhere, setElsewhere] = useState(false);
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [choice, setChoice] = useState<{ result: SearchResult; time: FreeTime } | null>(null);

  const problems = useQuery({ queryKey: ['problems'], queryFn: api.problems });
  const search = useMutation({
    mutationFn: () =>
      api.search({
        problem,
        periods,
        ...(elsewhere && city.trim() ? { city: city.trim() } : {}),
        ...(elsewhere && state.trim() ? { state: state.trim() } : {}),
      }),
    onSuccess: () => setChoice(null),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    search.mutate();
  };
  const updatePeriod = (i: number, p: SearchPeriod) =>
    setPeriods((list) => list.map((x, j) => (j === i ? p : x)));

  return (
    <>
      <PageHeader
        title="Book a dental visit"
        subtitle="Tell us what's wrong and when you're free. We'll show clinics near you with open times."
      />
      <Card>
        <form className="form" onSubmit={submit} aria-label="Search for a clinic">
          <fieldset className="span-2">
            <legend>What's the problem?</legend>
            {problems.isPending ? (
              <Spinner />
            ) : problems.isError ? (
              <ErrorNote error={problems.error} />
            ) : (
              <div className="choice-row">
                {problems.data.data.map((p) => (
                  <label key={p.key} className="choice">
                    <input
                      type="radio"
                      name="problem"
                      required
                      checked={problem === p.key}
                      onChange={() => setProblem(p.key)}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="span-2 stack gap-3">
            <legend>When are you free?</legend>
            {periods.map((p, i) => (
              <div key={i} className="period-row">
                <PeriodFields
                  value={p}
                  index={periods.length > 1 ? i : undefined}
                  onChange={(next) => updatePeriod(i, next)}
                />
                {periods.length > 1 && (
                  <Button
                    variant="ghost"
                    className="btn-sm"
                    onClick={() => setPeriods((list) => list.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {periods.length < MAX_PERIODS && (
              <div>
                <Button
                  variant="secondary"
                  className="btn-sm"
                  onClick={() =>
                    setPeriods((list) => [...list, newPeriod(addDays(list.at(-1)!.to_date, 1), 2)])
                  }
                >
                  Add another period
                </Button>
              </div>
            )}
          </fieldset>

          <div className="span-2">
            <label className="check">
              <input
                type="checkbox"
                checked={elsewhere}
                onChange={(e) => setElsewhere(e.target.checked)}
              />
              Search near somewhere other than my home address
            </label>
            {elsewhere && (
              <div className="form-grid mb-2">
                <Field label="Area or city" hint="e.g. Lekki, Ikeja, Yaba">
                  <input value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field label="State">
                  <input value={state} onChange={(e) => setState(e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          <div className="btn-row">
            <Button type="submit" busy={search.isPending} disabled={!problem}>
              Find clinics
            </Button>
          </div>
        </form>
      </Card>

      <ErrorNote error={search.error} />
      {search.data && (
        <Results
          data={search.data.data}
          onlyProvider={showAll ? null : onlyProvider}
          onShowAll={() => setShowAll(true)}
          choice={choice}
          onChoose={setChoice}
        />
      )}
      {choice && search.data && (
        <ConfirmBooking
          key={`${choice.result.centre_id}-${choice.time.starts_at}`}
          problem={search.data.data.problem}
          result={choice.result}
          time={choice.time}
          onCancel={() => setChoice(null)}
        />
      )}
    </>
  );
}

function Results({
  data,
  onlyProvider,
  onShowAll,
  choice,
  onChoose,
}: {
  data: SearchResponse;
  onlyProvider: number | null;
  onShowAll: () => void;
  choice: { result: SearchResult; time: FreeTime } | null;
  onChoose: (c: { result: SearchResult; time: FreeTime }) => void;
}) {
  const results = onlyProvider
    ? data.results.filter((r) => r.provider_id === onlyProvider)
    : data.results;
  const near = [data.near.city, data.near.state].filter(Boolean).join(', ');

  return (
    <section aria-label="Clinics with free times" className="stack gap-3 mt-4">
      <div className="section-head">
        <div>
          <h2>
            {results.length} {results.length === 1 ? 'centre' : 'centres'} for{' '}
            {data.problem.label.toLowerCase()}
          </h2>
          <p className="hint">
            {near ? `Nearest to ${near} first.` : 'Add your address to see the nearest first.'}{' '}
            Times are Lagos time.
          </p>
        </div>
      </div>
      {onlyProvider && (
        <Notice>
          Showing one clinic from the directory.{' '}
          <button type="button" className="link-btn" onClick={onShowAll}>
            Show all clinics
          </button>
        </Notice>
      )}
      {results.length === 0 ? (
        <EmptyState title="No free times found">
          No clinic that treats this has a free time in those periods. Try wider dates or another
          time of day.
        </EmptyState>
      ) : (
        results.map((r) => (
          <Card key={r.centre_id} className="result-card">
            <div className="card-head">
              <div>
                <h3>{r.provider_name}</h3>
                <div className="muted">{r.centre_name}</div>
              </div>
              <Pill tone={areaMatch[r.match].tone}>{areaMatch[r.match].label}</Pill>
            </div>
            <div className="result-meta">
              <span>
                {r.address_line}, {r.city}, {r.state}
              </span>
              <span>
                Consultation:{' '}
                <strong>
                  {r.consultation_fee
                    ? money(r.consultation_fee.amount, r.consultation_fee.currency)
                    : 'ask the clinic'}
                </strong>
              </span>
              {r.caregivers.length > 0 && (
                <span>{r.caregivers.map((c) => c.full_name).join(', ')}</span>
              )}
              <span>
                {r.free_count} free {r.free_count === 1 ? 'time' : 'times'}
              </span>
            </div>
            <TimePicker
              label={`Free times at ${r.provider_name}, ${r.centre_name}`}
              times={r.free_times}
              selected={choice?.result.centre_id === r.centre_id ? choice.time.starts_at : null}
              onSelect={(time) => onChoose({ result: r, time })}
            />
          </Card>
        ))
      )}
    </section>
  );
}

function ConfirmBooking({
  problem,
  result,
  time,
  onCancel,
}: {
  problem: { key: string; label: string };
  result: SearchResult;
  time: FreeTime;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<AppointmentMode>('physical');
  const [caregiverId, setCaregiverId] = useState('');
  const [details, setDetails] = useState('');
  const [emergency, setEmergency] = useState<'yes' | 'no' | ''>('');
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);

  const policies = useQuery({ queryKey: ['policies'], queryFn: api.policies });
  const consents = useQuery({ queryKey: ['consents'], queryFn: api.myConsents });
  const required = (policies.data?.data ?? []).filter((p) => p.required_for_requests);
  const missing = required.filter(
    (p) => !(consents.data?.data ?? []).find((c) => c.type === p.type)?.up_to_date,
  );

  const book = useMutation({
    mutationFn: async () => {
      // The patient ticked the box for exactly these policies.
      for (const p of missing) await api.decideConsent(p.type, true, 'request_form');
      return api.book({
        centre_id: result.centre_id,
        starts_at: time.starts_at,
        appointment_mode: mode,
        caregiver_id: caregiverId ? Number(caregiverId) : undefined,
        problem: problem.key,
        details: details.trim() || undefined,
        has_emergency_symptoms: false,
      });
    },
    onSuccess: (r) => {
      for (const key of ['appointments', 'requests', 'consents'])
        void queryClient.invalidateQueries({ queryKey: [key] });
      navigate(`/patient/requests/${r.data.care_request_id}?booked=1`, { replace: true });
    },
  });

  const ready = emergency === 'no' && (missing.length === 0 || agree) && consents.isSuccess;

  return (
    <section ref={ref} aria-label="Confirm your booking" className="card confirm-card mt-4">
      <div className="card-head">
        <div>
          <h2>Send booking request</h2>
          <p className="muted">
            {problem.label} at <strong>{result.provider_name}</strong>, {result.centre_name} ·{' '}
            <strong>{formatDateTime(time.starts_at)}</strong>
          </p>
        </div>
        <Button variant="ghost" className="btn-sm" onClick={onCancel}>
          Change time
        </Button>
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) book.mutate();
        }}
      >
        <fieldset className="span-2">
          <legend>How will you be seen?</legend>
          <ModeChoice value={mode} onChange={setMode} name="mode" />
          {mode === 'remote' && (
            <p className="hint">The clinic will call you; OnDiGoH only records that it happened.</p>
          )}
        </fieldset>
        {result.caregivers.length > 0 && (
          <Field label="Dentist (optional)">
            <select value={caregiverId} onChange={(e) => setCaregiverId(e.target.value)}>
              <option value="">No preference</option>
              {result.caregivers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} · {titleCase(c.role)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label="Anything the clinic should know? (optional)"
          hint="Only the clinic you book sees this."
          className="span-2"
        >
          <textarea
            rows={3}
            maxLength={2000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </Field>
        <fieldset className="span-2">
          <legend>
            Do you have severe swelling, trouble breathing or swallowing, heavy bleeding that won't
            stop, or a face/jaw injury?
          </legend>
          <div className="choice-row">
            {(['no', 'yes'] as const).map((v) => (
              <label key={v} className="choice">
                <input
                  type="radio"
                  name="emergency"
                  required
                  checked={emergency === v}
                  onChange={() => setEmergency(v)}
                />
                {v === 'yes' ? 'Yes' : 'No'}
              </label>
            ))}
          </div>
        </fieldset>
        {emergency === 'yes' ? (
          <div className="emergency span-2" role="alert">
            <h2>This needs emergency care now</h2>
            <p>Don't wait for a booking. Call emergency services or go to the nearest hospital.</p>
            <p>
              <span className="emergency-number">112</span> · Lagos State emergency{' '}
              <strong>767</strong>
            </p>
          </div>
        ) : (
          <>
            {missing.length > 0 && (
              <label className="check span-2">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span>
                  I agree to the {missing.map((p) => p.title.toLowerCase()).join(', ')} so this
                  booking can be shared with the clinic. <Link to="/policies">Read them</Link>
                </span>
              </label>
            )}
            <ErrorNote error={book.error} />
            <div className="btn-row">
              <Button type="submit" busy={book.isPending} disabled={!ready}>
                Send booking request
              </Button>
            </div>
            <p className="hint span-2">
              The clinic confirms your request; we'll notify you. Consultation fee:{' '}
              {result.consultation_fee
                ? money(result.consultation_fee.amount, result.consultation_fee.currency)
                : 'ask the clinic'}
              , paid at the clinic.
            </p>
          </>
        )}
      </form>
    </section>
  );
}
