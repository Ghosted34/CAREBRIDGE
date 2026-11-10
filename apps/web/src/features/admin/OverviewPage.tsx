import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/authContext';
import { Card, ErrorNote, PageHeader, Spinner, Stat } from '../../components/ui';

export function OverviewPage() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: api.metrics,
    refetchInterval: 60_000,
  });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorNote error={q.error} />;
  const m = q.data.data;
  const isAdmin = user?.role === 'admin';

  return (
    <>
      <PageHeader
        title="Operations overview"
        subtitle="Live counts across the CareLynk network."
      />
      <div className="grid grid-4">
        <Stat
          label="Open requests"
          value={m.open_care_requests}
          tone={m.open_care_requests ? 'gold' : undefined}
        />
        <Stat label="Total requests" value={m.care_requests} />
        <Stat label="Appointments" value={m.appointments} />
        <Stat label="Patients" value={m.patients} />
        <Stat label="Verified providers" value={m.verified_providers} />
        <Stat
          label="Providers awaiting review"
          value={m.pending_providers}
          tone={m.pending_providers ? 'gold' : undefined}
        />
        <Stat
          label="Staff awaiting approval"
          value={m.pending_provider_staff}
          tone={m.pending_provider_staff ? 'gold' : undefined}
        />
      </div>
      <h2 className="section-title">Needs attention</h2>
      <div className="grid grid-3">
        <Card>
          <h3>Unmatched requests</h3>
          <p className="muted">
            {m.open_care_requests} waiting for or reviewing offers. Match by hand if a request sits
            too long.
          </p>
          <Link className="btn btn-secondary btn-sm" to="/ops/queue">
            Open queue
          </Link>
        </Card>
        <Card>
          <h3>Provider verification</h3>
          <p className="muted">
            {m.pending_providers} provider(s) pending. Only verified providers receive patients.
          </p>
          <Link className="btn btn-secondary btn-sm" to="/ops/providers">
            Review providers
          </Link>
        </Card>
        {isAdmin && (
          <Card>
            <h3>Staff approvals</h3>
            <p className="muted">
              {m.pending_provider_staff} staff account(s) waiting to be approved and linked.
            </p>
            <Link className="btn btn-secondary btn-sm" to="/ops/users">
              Review users
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
