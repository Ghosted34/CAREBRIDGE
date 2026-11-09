import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/authContext';
import { cleanIdentifier } from '../../lib/text';
import { Button, Card, ErrorNote, Field, Notice } from '../../components/ui';

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
      const r = await api.register(form);
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
            Your provider staff account has been created and is <strong>awaiting approval</strong>.
            A CareBridge administrator will verify your clinic and link your account before you can
            sign in.
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
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={form.password}
              onChange={set('password')}
            />
          </Field>
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
            Create account
          </Button>
        </form>
        <p className="muted small" style={{ marginTop: 14 }}>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
