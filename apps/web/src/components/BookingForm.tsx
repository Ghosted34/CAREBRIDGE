import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState as useReactState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/endpoints';
import type { Centre, MatchingProvider, ProviderSlot } from '../api/types';
import { toLagosLocal } from '../lib/time';
import { Button, Card, EmptyState, ErrorNote, Field, PageHeader, Spinner } from './ui';

const PROBLEMS = [
  'Toothache / pain',
  'Root canal assessment',
  'Cleaning and check-up',
  'Broken or chipped tooth',
  'Gum problems',
  'Braces / orthodontic consultation',
  'Tooth extraction',
  'Other',
];

type Step = 'problem' | 'provider' | 'centre' | 'slot' | 'confirm';

/**
 * Simplified booking form: patient submits 2 inputs (problem + date), then picks a provider,
 * centre, time slot and optional caregiver. Creates a `requested` appointment — the provider
 * confirms or declines. No offer/bidding round.
 */
export function BookingForm({
  careRequestId,
  onBooked,
  defaultProblem,
  defaultDate,
}: {
  careRequestId: number;
  onBooked?: () => void;
  defaultProblem?: string;
  defaultDate?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useReactState<Step>(
    defaultProblem && defaultDate ? 'provider' : 'problem',
  );
  const [problem, setProblem] = useReactState<string>(defaultProblem ?? PROBLEMS[0]!);
  const [date, setDate] = useReactState<string>(defaultDate ?? '');
  const [selectedProvider, setSelectedProvider] = useReactState<MatchingProvider | null>(null);
  const [selectedCentre, setSelectedCentre] = useReactState<Centre | null>(null);
  const [selectedSlot, setSelectedSlot] = useReactState<ProviderSlot | null>(null);
  const [selectedCaregiver, setSelectedCaregiver] = useReactState<number | null>(null);

  const { data: providers, isPending: matchingPending } = useQuery({
    queryKey: ['matches', careRequestId],
    queryFn: () => api.matchesForRequest(careRequestId),
    enabled: step === 'provider' && date !== '',
  });

  const { data: centres, isPending: centresPending } = useQuery({
    queryKey: ['centres', selectedProvider?.provider_id, careRequestId],
    queryFn: () =>
      selectedProvider
        ? api.centres(selectedProvider.provider_id, careRequestId)
        : Promise.resolve({ data: [] }),
    enabled: Boolean(selectedProvider),
  });

  const { data: slotsData, isPending: slotsPending } = useQuery({
    queryKey: ['slots', selectedCentre?.id, date],
    queryFn: () =>
      selectedCentre && date
        ? api.centreSlots(selectedCentre.id, {
            from: `${date}T00:00:00+01:00`,
            to: `${date}T23:59:59+01:00`,
            status: 'available',
          })
        : Promise.resolve({ data: [] }),
    enabled: Boolean(selectedCentre) && Boolean(date),
  });

  const { data: caregivers } = useQuery({
    queryKey: ['caregivers', selectedProvider?.provider_id, careRequestId],
    queryFn: () =>
      selectedProvider
        ? api.caregivers(selectedProvider.provider_id, careRequestId)
        : Promise.resolve({ data: [] }),
    enabled: Boolean(selectedProvider),
  });

  const book = useMutation({
    mutationFn: () => {
      if (!selectedProvider || !selectedCentre || !selectedSlot) {
        throw new Error('Provider, centre and slot required');
      }
      if (!selectedCentre.id) {
        throw new Error('Centre is missing an ID');
      }
      const body: {
        care_request_id: number;
        provider_id: number;
        centre_id: number;
        starts_at: string;
        ends_at: string;
        appointment_type: 'assessment';
        appointment_mode: 'physical';
        caregiver_id?: number;
      } = {
        care_request_id: careRequestId,
        provider_id: selectedProvider.provider_id,
        centre_id: selectedCentre.id,
        starts_at: selectedSlot.start_time,
        ends_at: selectedSlot.end_time,
        appointment_type: 'assessment',
        appointment_mode: 'physical',
      };
      if (selectedCaregiver) body.caregiver_id = selectedCaregiver;
      return api.book(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      onBooked?.();
      navigate(`/patient/requests/${careRequestId}`, { replace: true });
    },
  });

  const centreSlots = (slotsData?.data ?? []).filter((s) => s.start_time.startsWith(date));

  const centreCaregivers = (caregivers?.data ?? []).filter(
    (c) => c.centre_id === selectedCentre?.id,
  );

  const back = (next: Step) => () => setStep(next);

  const goToProvider = (e: FormEvent) => {
    e.preventDefault();
    if (!date) return;
    setStep('provider');
  };

  const chooseProvider = (p: MatchingProvider) => {
    setSelectedProvider(p);
    setSelectedCentre(null);
    setSelectedSlot(null);
    setSelectedCaregiver(null);
    setStep('centre');
  };

  const chooseCentre = (c: Centre) => {
    setSelectedCentre(c);
    setSelectedSlot(null);
    setSelectedCaregiver(null);
    setStep('slot');
  };

  const chooseSlot = (s: ProviderSlot) => {
    setSelectedSlot(s);
    setStep('confirm');
  };

  const formatSlot = (s: ProviderSlot) => {
    return new Date(s.start_time).toLocaleString('en-NG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  if (step === 'problem') {
    return (
      <>
        <PageHeader
          title="Book your visit"
          subtitle="Tell us what you need and when you'd like to be seen."
        />
        <Card>
          <form className="form" onSubmit={goToProvider}>
            <Field label="What's the problem?" className="span-2">
              <select required value={problem} onChange={(e) => setProblem(e.target.value)}>
                {PROBLEMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Preferred date">
              <input
                type="date"
                required
                value={date}
                min={toLagosLocal(new Date()).slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <ErrorNote error={book.error} />
            <div className="btn-row">
              <Button type="submit" busy={book.isPending} disabled={!date}>
                Find clinics
              </Button>
            </div>
          </form>
        </Card>
      </>
    );
  }

  if (step === 'provider') {
    if (matchingPending) return <Spinner label="Finding clinics" />;
    if (!providers?.data || providers.data.length === 0) {
      return (
        <>
          <PageHeader title="Choose a clinic" subtitle="Clinics ranked by match score." />
          <div className="btn-row" style={{ marginBottom: 16 }}>
            <Button variant="ghost" onClick={back('problem')}>
              ← Change problem or date
            </Button>
          </div>
          <Card>
            <EmptyState title="No clinics available">
              No verified clinics have open slots on {date}. Try another day.
            </EmptyState>
          </Card>
        </>
      );
    }
    return (
      <>
        <PageHeader title="Choose a clinic" subtitle="Clinics ranked by match score." />
        <div className="btn-row" style={{ marginBottom: 16 }}>
          <Button variant="ghost" onClick={back('problem')}>
            ← Change problem or date
          </Button>
        </div>
        <Card>
          <ul className="list">
            {providers.data.map((p) => (
              <li key={p.provider_id} className="list-item">
                <div className="list-item-main">
                  <div className="list-item-title">{p.display_name}</div>
                  <div className="meta">
                    {p.city} · {p.specialties.join(', ')}
                  </div>
                  <div className="meta">
                    Match: {p.score.total}% ({p.score.tier})
                  </div>
                </div>
                <Button
                  type="button"
                  variant={selectedProvider?.provider_id === p.provider_id ? 'primary' : 'ghost'}
                  onClick={() => chooseProvider(p)}
                >
                  Choose {p.display_name}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  if (step === 'centre') {
    if (centresPending) return <Spinner label="Loading locations" />;
    return (
      <>
        <PageHeader
          title="Choose a location"
          subtitle={`${selectedProvider?.display_name} — pick the centre nearest you.`}
        />
        <div className="btn-row" style={{ marginBottom: 16 }}>
          <Button variant="ghost" onClick={back('provider')}>
            ← Change clinic
          </Button>
        </div>
        <Card>
          {centres?.data?.length === 0 ? (
            <EmptyState title="No locations configured">
              This clinic has no operating centres yet. Set up operating hours in Clinic Capacity &
              Slots, then come back to pick a location.
            </EmptyState>
          ) : (
            <ul className="list">
              {centres?.data.map((c) => (
                <li key={c.id} className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">{c.name}</div>
                    <div className="meta">
                      {c.address_line}, {c.city}, {c.state} {c.postal_code}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={selectedCentre?.id === c.id ? 'primary' : 'ghost'}
                    onClick={() => chooseCentre(c)}
                  >
                    Select {c.name}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  }

  if (step === 'slot') {
    return (
      <>
        <PageHeader
          title="Choose a time"
          subtitle={`${selectedCentre?.name} · ${selectedProvider?.display_name}`}
        />
        <div className="btn-row" style={{ marginBottom: 16 }}>
          <Button variant="ghost" onClick={back('centre')}>
            ← Change location
          </Button>
        </div>
        <Card>
          {slotsPending ? (
            <Spinner label="Loading slots" />
          ) : centreSlots.length === 0 ? (
            <EmptyState title="No slots available">
              No open slots at {selectedCentre?.name} on {date}. Try another day.
            </EmptyState>
          ) : (
            <ul className="list">
              {centreSlots.map((s) => (
                <li key={s.id} className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">{formatSlot(s)}</div>
                    <div className="meta">
                      {s.currency ?? 'NGN'} {s.price?.toLocaleString() ?? 'TBD'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={selectedSlot?.id === s.id ? 'primary' : 'ghost'}
                    onClick={() => chooseSlot(s)}
                  >
                    Select
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  }

  if (step === 'confirm') {
    return (
      <>
        <PageHeader title="Confirm your request" subtitle="Review before sending." />
        <div className="btn-row" style={{ marginBottom: 16 }}>
          <Button variant="ghost" onClick={back('slot')}>
            ← Change time
          </Button>
        </div>
        <Card>
          <dl className="kv">
            <dt>Clinic</dt>
            <dd>{selectedProvider?.display_name}</dd>
            <dt>Location</dt>
            <dd>{selectedCentre?.name}</dd>
            <dt>When</dt>
            <dd>{selectedSlot ? formatSlot(selectedSlot) : ''}</dd>
            <dt>Mode</dt>
            <dd>In-person at the centre</dd>
            {selectedCaregiver ? (
              <>
                <dt>Caregiver</dt>
                <dd>{centreCaregivers.find((c) => c.id === selectedCaregiver)?.full_name ?? ''}</dd>
              </>
            ) : null}
          </dl>
          <ErrorNote error={book.error} />
          <div className="btn-row">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep('problem')}
              busy={book.isPending}
            >
              Start over
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => book.mutate()}
              busy={book.isPending}
            >
              Send booking request
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return null;
}
