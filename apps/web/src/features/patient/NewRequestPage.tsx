import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
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
 * No care request is created until the patient clicks "Send booking request"
 * at the end of the booking flow — no incomplete requests are left behind.
 * No emergency triage, no urgency, no free-text description, no offer round.
 */
export function NewRequestPage() {
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string>(PROBLEMS[0]!);
  const [date, setDate] = useState<string>('');
  const [showBooking, setShowBooking] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!date) return;
    setShowBooking(true);
  };

  if (showBooking) {
    return (
      <>
        <PageHeader title="Choose a clinic" subtitle="Clinics ranked by match score." />
        <BookingForm
          defaultProblem={problem}
          defaultDate={date}
          onBooked={() => {
            setShowBooking(false);
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
          <ErrorNote error={undefined} />
          <div className="btn-row">
            <Button type="submit" disabled={!date}>
              Find clinics
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
