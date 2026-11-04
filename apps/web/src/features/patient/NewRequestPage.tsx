import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Urgency } from '../../api/types';
import { Button, Card, ErrorNote, Field, PageHeader } from '../../components/ui';

const SERVICES = [
  'Toothache / pain assessment',
  'Root canal assessment',
  'Cleaning and check-up',
  'Broken or chipped tooth',
  'Gum problems',
  'Braces / orthodontic consultation',
  'Tooth extraction',
  'Other',
];

export function NewRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    service_type: SERVICES[0]!,
    description: '',
    preferred_city: 'Lagos',
    urgency: 'routine' as Urgency,
  });
  const [emergency, setEmergency] = useState<boolean | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createRequest({
        ...form,
        specialty: 'dentistry',
        has_emergency_symptoms: emergency === true,
      }),
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      navigate(`/patient/requests/${data.id}`, { replace: true, state: { created: true } });
    },
  });

  // The API is the source of truth for emergency handling: it refuses the request with guidance.
  if (create.error instanceof ApiError && create.error.code === 'EMERGENCY_REDIRECT') {
    return (
      <div className="emergency" role="alert">
        <h2>Please get emergency help now</h2>
        <p>{create.error.message}</p>
        <div className="emergency-number">112</div>
        <p className="muted">Your request has not been sent to clinics.</p>
        <div className="btn-row">
          <a className="btn btn-primary" href="tel:112">
            Call 112
          </a>
          <Link to="/patient" className="btn btn-ghost">
            Back to my care
          </Link>
        </div>
      </div>
    );
  }

  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors() : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (emergency === null) return;
    create.mutate();
  };

  return (
    <>
      <PageHeader
        title="Request dental care"
        subtitle="Verified Lagos providers will review your request and respond."
      />
      <Card>
        <form className="form" onSubmit={submit}>
          <fieldset>
            <legend className="legend">
              Do you have severe swelling, uncontrolled bleeding, difficulty breathing or
              swallowing, or a serious injury to your face or jaw?
            </legend>
            <div className="choice-row">
              <label className="choice">
                <input
                  type="radio"
                  name="emergency"
                  required
                  checked={emergency === false}
                  onChange={() => setEmergency(false)}
                />
                No
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="emergency"
                  checked={emergency === true}
                  onChange={() => setEmergency(true)}
                />
                Yes
              </label>
            </div>
          </fieldset>

          <div className="form-grid">
            <Field label="What do you need?">
              <select
                value={form.service_type}
                onChange={(e) => setForm({ ...form, service_type: e.target.value })}
              >
                {SERVICES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="How soon?">
              <select
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value as Urgency })}
              >
                <option value="routine">Routine — within a few weeks</option>
                <option value="soon">Soon — within a week</option>
                <option value="urgent">Urgent — in the next day or two</option>
              </select>
            </Field>
            <Field
              label="Describe the problem"
              hint="How long, where it hurts, anything that makes it better or worse. Don't include other people's details."
              error={fieldErrors.description?.[0]}
              className="span-2"
            >
              <textarea
                required
                minLength={10}
                maxLength={4000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="Area" hint="The pilot currently covers Lagos.">
              <select value={form.preferred_city} disabled>
                <option>Lagos</option>
              </select>
            </Field>
          </div>
          {Object.keys(fieldErrors).length === 0 && <ErrorNote error={create.error} />}
          <div className="btn-row">
            <Button type="submit" busy={create.isPending} disabled={emergency === null}>
              Send request
            </Button>
            <span className="muted small">
              Only verified providers who offer this service will see it.
            </span>
          </div>
        </form>
      </Card>
    </>
  );
}
