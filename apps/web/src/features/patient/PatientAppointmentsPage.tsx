import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import { Card, EmptyState, ErrorNote, PageHeader, Pill, Spinner } from '../../components/ui';
import { appointmentStatus, appointmentType } from '../../lib/labels';
import { formatTimeRange } from '../../lib/time';

export function PatientAppointmentsPage() {
  const q = useQuery({ queryKey: ['appointments', 'mine'], queryFn: api.myAppointments });
  return (
    <>
      <PageHeader title="Appointments" subtitle="All times are Lagos time." />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="No appointments yet">
          Once a provider is confirmed you can book from the request page.
        </EmptyState>
      ) : (
        <Card>
          <ul className="list">
            {q.data.data.map((a) => (
              <li key={a.id}>
                <Link to={`/patient/requests/${a.care_request_id}`} className="row-link list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {appointmentType[a.appointment_type]} · {a.provider}
                    </div>
                    <div className="meta">{formatTimeRange(a.starts_at, a.ends_at)}</div>
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
    </>
  );
}
