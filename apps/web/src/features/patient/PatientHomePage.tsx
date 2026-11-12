import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/authContext';
import { Card, EmptyState, ErrorNote, PageHeader, Pill, Spinner } from '../../components/ui';
import { appointmentStatus, requestStatus } from '../../lib/labels';
import { formatDate, formatDateTime } from '../../lib/time';

const UPCOMING = new Set(['requested', 'booked', 'confirmed']);

export function PatientHomePage() {
  const { user } = useAuth();
  const visits = useQuery({ queryKey: ['requests', 'mine'], queryFn: api.myRequests });
  const appts = useQuery({
    queryKey: ['appointments', 'mine'],
    queryFn: () => api.myAppointments(),
  });
  const firstName = user?.full_name.split(' ')[0];
  const now = new Date().toISOString();
  const upcoming = (appts.data?.data ?? [])
    .filter((a) => UPCOMING.has(a.status) && a.ends_at > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <>
      <PageHeader
        title={`Hello${firstName ? `, ${firstName}` : ''}`}
        subtitle="Your dental visits and what's next."
        actions={
          <Link to="/patient/new" className="btn btn-primary">
            Book a visit
          </Link>
        }
      />
      {upcoming.length > 0 && (
        <Card className="mb-3">
          <h2 className="mb-1">Coming up</h2>
          <ul className="list">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link to={`/patient/requests/${a.care_request_id}`} className="row-link list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">{formatDateTime(a.starts_at)}</div>
                    <div className="meta">
                      <span>
                        {a.provider}
                        {a.centre_name && `, ${a.centre_name}`}
                      </span>
                      <span>
                        {a.appointment_mode === 'remote' ? 'Video / voice call' : 'In person'}
                      </span>
                    </div>
                  </div>
                  <Pill tone={appointmentStatus[a.status].tone}>
                    {appointmentStatus[a.status].label}
                  </Pill>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {visits.isPending ? (
        <Spinner />
      ) : visits.isError ? (
        <ErrorNote error={visits.error} />
      ) : visits.data.data.length === 0 ? (
        <EmptyState title="No visits yet">
          <p>
            Tell us what's wrong and when you're free; we'll show clinics near you with open times.
          </p>
          <Link to="/patient/new" className="btn btn-primary">
            Book a visit
          </Link>
        </EmptyState>
      ) : (
        <Card>
          <h2 className="mb-1">My visits</h2>
          <ul className="list">
            {visits.data.data.map((r) => {
              const s = requestStatus[r.status];
              return (
                <li key={r.id}>
                  <Link to={`/patient/requests/${r.id}`} className="row-link list-item">
                    <div className="list-item-main">
                      <div className="list-item-title">{r.service_type}</div>
                      <div className="meta">
                        <span>#{r.id}</span>
                        <span>Started {formatDate(r.created_at)}</span>
                        {r.assigned_provider && <span>with {r.assigned_provider}</span>}
                      </div>
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
