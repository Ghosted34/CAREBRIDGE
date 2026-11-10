import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/endpoints';
import { BookingForm } from '../../components/BookingForm';
import { Button, Card, ErrorNote, Field, PageHeader } from '../../components/ui';

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

/**
 * Simplified request page: patient submits 2 inputs (problem + date), then is
 * taken straight to clinic matching → centre → slot → caregiver → booking request.
 * No emergency triage, no urgency, no free-text description, no offer round.
 */
export function NewRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<string>(PROBLEMS[0]!);
  const [date, setDate] = useState<string>('');
  const [showBooking, setShowBooking] = useState(false);
  const [careRequestId, setCareRequestId] = useState<number | null>(null);

  const policies = useQuery({ queryKey: ['policies'], queryFn: api.policies, staleTime: Infinity });
  const consents = useQuery({ queryKey: ['consents'], queryFn: api.myConsents });

  const create = useMutation({
    mutationFn: async () => {
      // Record consents needed to share the request (data sharing, terms, privacy).
      const required = new Set(
        (policies.data?.data ?? []).filter((p) => p.required_for_requests).map((p) => p.type),
      );
      const missing = (consents.data?.data ?? []).filter(
        (c) => required.has(c.type) && !c.up_to_date,
      );
      for (const m of missing) await api.decideConsent(m.type, true, 'request_form');

      return api.createRequest({
        specialty: 'dentistry',
        service_type: problem,
        description: problem,
        preferred_city: 'Lagos',
        urgency: 'routine',
        has_emergency_symptoms: false,
      });
    },
    onSuccess: ({ data }) => {
      setCareRequestId(data.id);
      setShowBooking(true);
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['consents'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  if (showBooking && careRequestId !== null) {
    return (
      <>
        <PageHeader title="Choose a clinic" subtitle="Clinics ranked by match score." />
        <BookingForm
          careRequestId={careRequestId}
          defaultProblem={problem}
          defaultDate={date}
          onBooked={() => {
            setShowBooking(false);
            setCareRequestId(null);
            navigate('/patient', { replace: true });
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Request dental care"
        subtitle="Tell us what you need and when you'd like to be seen."
      />
      <Card>
        <form className="form" onSubmit={submit}>
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
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <ErrorNote error={create.error} />
          <div className="btn-row">
            <Button type="submit" busy={create.isPending} disabled={!date}>
              Find clinics
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
