import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [agreed, setAgreed] = useState(false);

  // Consents needed to share a request (data sharing, plus terms/privacy if their version changed).
  const policies = useQuery({ queryKey: ['policies'], queryFn: api.policies, staleTime: Infinity });
  const consents = useQuery({ queryKey: ['consents'], queryFn: api.myConsents });
  const required = new Set(
    (policies.data?.data ?? []).filter((p) => p.required_for_requests).map((p) => p.type),
  );
  const missing = (consents.data?.data ?? []).filter((c) => required.has(c.type) && !c.up_to_date);
  const missingPolicies = (policies.data?.data ?? []).filter((p) =>
    missing.some((m) => m.type === p.type),
  );

  const create = useMutation({
    mutationFn: async () => {
      // Record consent first (only when the patient ticked the box), then send the request.
      if (emergency === false) {
        for (const m of missing) await api.decideConsent(m.type, true, 'request_form');
      }
      return api.createRequest({
        ...form,
        specialty: 'dentistry',
        has_emergency_symptoms: emergency === true,
      });
    },
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['consents'] });
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
          {missingPolicies.length > 0 && (
            <div className="consent-box">
              <h3>Before we share your request</h3>
              {missingPolicies.map((p) => (
                <p key={p.type} className="small">
                  <strong>{p.title}.</strong> {p.summary}
                </p>
              ))}
              <label className="check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I agree{missingPolicies.length > 1 ? ' to the above' : ''}.{' '}
                  <Link to="/policies" target="_blank">
                    Read more
                  </Link>
                </span>
              </label>
            </div>
          )}
          {Object.keys(fieldErrors).length === 0 && <ErrorNote error={create.error} />}
          <div className="btn-row">
            <Button
              type="submit"
              busy={create.isPending}
              disabled={
                emergency === null ||
                consents.isPending ||
                (missingPolicies.length > 0 && emergency === false && !agreed)
              }
            >
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
