import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/authContext';
import { cleanIdentifier } from '../../lib/text';
import { Button, Card, ErrorNote, Field, Notice, PasswordField } from '../../components/ui';

export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'patient' as 'patient' | 'provider_staff',
    accept_terms: false,
    accept_privacy: false,
    marketing_opt_in: false,
  });
  // Filled in only by clinic / provider staff: the facility is created `pending` and this person
  // becomes its owner, so they can manage their own team once CareBridge verifies it.
  const [clinic, setClinic] = useState({
    legal_name: '',
    display_name: '',
    registration_number: '',
    address: '',
    specialties: 'dentistry',
  });
  const isClinic = form.role === 'provider_staff';
  const check =
    (k: 'accept_terms' | 'accept_privacy' | 'marketing_opt_in') =>
    (e: { target: { checked: boolean } }) =>
      setForm((f) => ({ ...f, [k]: e.target.checked }));
  const set =
    (k: 'full_name' | 'email' | 'phone' | 'password') => (e: { target: { value: string } }) =>
      setForm((f) => ({
        ...f,
        [k]: k === 'email' || k === 'phone' ? cleanIdentifier(e.target.value) : e.target.value,
      }));

  const register = useMutation({
    mutationFn: async () => {
      const r = await api.register({
        ...form,
        clinic: isClinic
          ? {
              legal_name: clinic.legal_name,
              display_name: clinic.display_name,
              provider_type: 'clinic',
              registration_number: clinic.registration_number,
              city: 'Lagos',
              address: clinic.address,
              // Comma separated in the field, snake_case array for the API (e.g. "Oral surgery").
              specialties: clinic.specialties
                .split(',')
                .map((x) => x.trim().toLowerCase().replace(/\s+/g, '_'))
                .filter(Boolean),
            }
          : undefined,
      });
      if (r.data.status === 'active') {
        await login(form.email, form.password);
        navigate('/patient/new', { replace: true });
      }
      return r.data;
    },
  });
  const fieldErrors = register.error instanceof ApiError ? register.error.fieldErrors() : {};
  const fe = (k: string) => fieldErrors[k]?.[0];

  if (register.data?.status === 'pending') {
    return (
      <div className="auth-wrap">
        <Card>
          <h1>Thanks — we’ll be in touch</h1>
          <Notice tone="success">
            Your account and facility details have been submitted and are{' '}
            <strong>awaiting verification</strong>. CareBridge checks your registration, then you
            can sign in and manage your clinic team yourself.
          </Notice>
          <p style={{ marginTop: 14 }}>
            <Link to="/">Back to home</Link>
          </p>
        </Card>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate();
  };

  return (
    <div className="auth-wrap">
      <Card>
        <h1>Create your account</h1>
        <form className="form" onSubmit={submit} noValidate>
          <fieldset>
            <legend className="legend">I am</legend>
            <div className="choice-row">
              <label className="choice">
                <input
                  type="radio"
                  name="role"
                  checked={form.role === 'patient'}
                  onChange={() => setForm((f) => ({ ...f, role: 'patient' }))}
                />
                Looking for care
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="role"
                  checked={form.role === 'provider_staff'}
                  onChange={() => setForm((f) => ({ ...f, role: 'provider_staff' }))}
                />
                Clinic / provider staff
              </label>
            </div>
          </fieldset>
          <Field label="Full name" error={fe('full_name')}>
            <input
              autoComplete="name"
              required
              value={form.full_name}
              onChange={set('full_name')}
            />
          </Field>
          <Field label="Email" error={fe('email')}>
            <input
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set('email')}
            />
          </Field>
          <Field label="Phone" hint="e.g. +234 801 234 5678" error={fe('phone')}>
            <input
              type="tel"
              autoComplete="tel"
              required
              value={form.phone}
              onChange={set('phone')}
            />
          </Field>
          <Field label="Password" hint="At least 10 characters" error={fe('password')}>
            <PasswordField
              autoComplete="new-password"
              required
              minLength={10}
              value={form.password}
              onValueChange={(password) => setForm((f) => ({ ...f, password }))}
            />
          </Field>
          {isClinic && (
            <fieldset className="consent-box">
              <legend className="legend">Your facility</legend>
              <p className="small muted">
                Submitted for verification. Nothing is published and no patient can reach you until
                CareBridge approves it.
              </p>
              <div className="form-grid">
                <Field label="Clinic name" error={fe('clinic')}>
                  <input
                    required
                    autoComplete="organization"
                    placeholder="e.g. Lekki Smile Clinic"
                    value={clinic.display_name}
                    onChange={(e) => setClinic((c) => ({ ...c, display_name: e.target.value }))}
                  />
                </Field>
                <Field label="Registered (legal) name">
                  <input
                    required
                    autoComplete="organization"
                    placeholder="e.g. Lekki Smile Clinic Ltd"
                    value={clinic.legal_name}
                    onChange={(e) => setClinic((c) => ({ ...c, legal_name: e.target.value }))}
                  />
                </Field>
                <Field
                  label="Registration number"
                  hint="MDCN or state facility registration"
                  className="span-2"
                >
                  <input
                    required
                    placeholder="e.g. MDCN/R/12345"
                    value={clinic.registration_number}
                    onChange={(e) =>
                      setClinic((c) => ({ ...c, registration_number: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Address" className="span-2">
                  <input
                    required
                    placeholder="Street, area, Lagos"
                    value={clinic.address}
                    onChange={(e) => setClinic((c) => ({ ...c, address: e.target.value }))}
                  />
                </Field>
                <Field
                  label="Specialties"
                  hint="Comma separated, e.g. dentistry, endodontics"
                  className="span-2"
                >
                  <input
                    required
                    value={clinic.specialties}
                    onChange={(e) => setClinic((c) => ({ ...c, specialties: e.target.value }))}
                  />
                </Field>
              </div>
            </fieldset>
          )}
          <fieldset className="consents">
            <legend className="legend">Agreements</legend>
            <label className="check">
              <input
                type="checkbox"
                required
                checked={form.accept_terms}
                onChange={check('accept_terms')}
              />
              <span>
                I accept the{' '}
                <Link to="/policies#terms" target="_blank">
                  terms of use
                </Link>
                . I understand CareBridge is not an emergency service.
              </span>
            </label>
            {fe('accept_terms') && <span className="field-error">{fe('accept_terms')}</span>}
            <label className="check">
              <input
                type="checkbox"
                required
                checked={form.accept_privacy}
                onChange={check('accept_privacy')}
              />
              <span>
                I have read the{' '}
                <Link to="/policies#privacy" target="_blank">
                  privacy notice
                </Link>
                .
              </span>
            </label>
            {fe('accept_privacy') && <span className="field-error">{fe('accept_privacy')}</span>}
            <label className="check">
              <input
                type="checkbox"
                checked={form.marketing_opt_in}
                onChange={check('marketing_opt_in')}
              />
              <span>Send me occasional updates about CareBridge (optional).</span>
            </label>
          </fieldset>
          {Object.keys(fieldErrors).length === 0 && <ErrorNote error={register.error} />}
          <Button
            type="submit"
            busy={register.isPending}
            disabled={!form.accept_terms || !form.accept_privacy}
          >
            {isClinic ? 'Submit for verification' : 'Create account'}
          </Button>
        </form>
        <p className="muted small" style={{ marginTop: 14 }}>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
