import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/authContext';
import { Card, EmptyState, ErrorNote, PageHeader, Pill, Spinner } from '../../components/ui';
import { requestStatus, titleCase } from '../../lib/labels';
import { formatDate } from '../../lib/time';

export function PatientHomePage() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['requests', 'mine'], queryFn: api.myRequests });
  const firstName = user?.full_name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Hello${firstName ? `, ${firstName}` : ''}`}
        subtitle="Your care requests and where each one stands."
        actions={
          <Link to="/patient/new" className="btn btn-primary">
            New care request
          </Link>
        }
      />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="No care requests yet">
          <p>Tell us what you need and verified providers will respond.</p>
          <Link to="/patient/new" className="btn btn-primary">
            Request care
          </Link>
        </EmptyState>
      ) : (
        <Card>
          <ul className="list">
            {q.data.data.map((r) => {
              const s = requestStatus[r.status];
              return (
                <li key={r.id}>
                  <Link to={`/patient/requests/${r.id}`} className="row-link list-item">
                    <div className="list-item-main">
                      <div className="list-item-title">
                        {titleCase(r.specialty)} · {r.service_type}
                      </div>
                      <div className="meta">
                        <span>#{r.id}</span>
                        <span>Requested {formatDate(r.created_at)}</span>
                        {r.assigned_provider && <span>with {r.assigned_provider}</span>}
                      </div>
                      <div className="small muted">{s.hint}</div>
                    </div>
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
