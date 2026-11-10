import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { homePathFor, useAuth } from '../../auth/authContext';
import { cleanIdentifier } from '../../lib/text';
import { Button, Card, ErrorNote, Field, PasswordField } from '../../components/ui';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await login(email, password);
      navigate(from ?? homePathFor(me.role), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <Card>
        <h1>Sign in</h1>
        <form className="form" onSubmit={submit}>
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(cleanIdentifier(e.target.value))}
            />
          </Field>
          <Field label="Password">
            <PasswordField required value={password} onValueChange={setPassword} />
          </Field>
          <ErrorNote error={error} />
          <Button type="submit" busy={busy}>
            Sign in
          </Button>
        </form>
        <p className="muted small" style={{ marginTop: 14 }}>
          New to CareLynk? <Link to="/register">Create an account</Link>
        </p>
      </Card>
      {import.meta.env.DEV && (
        <p className="demo-accounts muted">
          Dev seed accounts (password <code>CareBridge!2026</code>):{' '}
          <code>patient@carebridge.local</code>, <code>owner.lekki@carebridge.local</code>,{' '}
          <code>operator@carebridge.local</code>, <code>admin@carebridge.local</code>
        </p>
      )}
    </div>
  );
}
