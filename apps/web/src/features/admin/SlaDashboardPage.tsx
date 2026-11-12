import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { Card, EmptyState, ErrorNote, PageHeader, Pill, Spinner } from '../../components/ui';
import { appointmentStatus, slaCategory } from '../../lib/labels';
import { formatDateTime } from '../../lib/time';

const age = (minutes: number) => {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`;
};

/** Bookings that need a nudge: unconfirmed requests, visits with no check-in, visits with no outcome. */
export function SlaDashboardPage() {
  const q = useQuery({
    queryKey: ['stuck-requests'],
    queryFn: () => api.stuckRequests(),
    refetchInterval: 30_000,
  });
  const stuck = q.data?.data ?? [];
  const breached = stuck.filter((s) => slaCategory[s.sla_category].tone === 'red').length;

  return (
    <>
      <PageHeader
        title="Bookings needing attention"
        subtitle="Clinics should confirm within an hour, record check-in or no-show, and add notes within a day."
        actions={
          <>
            <Pill tone="red">{breached} over 2h</Pill>
            <Pill tone="gold">{stuck.length - breached} warnings</Pill>
          </>
        }
      />
      <Card>
        {q.isPending ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorNote error={q.error} />
        ) : stuck.length === 0 ? (
          <EmptyState title="Nothing stuck">Every booking is moving.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Patient</th>
                  <th>Clinic</th>
                  <th>Appointment</th>
                  <th>Status</th>
                  <th>Waiting</th>
                </tr>
              </thead>
              <tbody>
                {stuck.map((r) => {
                  const sla = slaCategory[r.sla_category];
                  return (
                    <tr key={r.appointment_id}>
                      <td>
                        <Pill tone={sla.tone}>{sla.label}</Pill>
                        <div className="hint">{sla.hint}</div>
                      </td>
                      <td>
                        {r.patient_name}
                        <div className="hint">Visit #{r.id}</div>
                      </td>
                      <td>
                        {r.assigned_provider}
                        {r.centre_name && <div className="hint">{r.centre_name}</div>}
                      </td>
                      <td>{formatDateTime(r.starts_at)}</td>
                      <td>{appointmentStatus[r.status].label}</td>
                      <td>{age(r.age_minutes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
