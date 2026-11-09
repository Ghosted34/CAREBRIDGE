import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import { Card, EmptyState, Pill } from '../../components/ui';
import { slaCategory, urgency } from '../../lib/labels';
import { formatDateTime } from '../../lib/time';

export function SlaDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stuck-requests'],
    queryFn: () => api.stuckRequests(),
    refetchInterval: 30_000,
  });

  const stuck = data?.data ?? [];
  const breachedCount = stuck.filter(
    (s) => s.sla_category === 'unmatched_breach' || s.sla_category === 'unbooked_delay',
  ).length;
  const warningCount = stuck.filter(
    (s) => s.sla_category === 'unmatched_warning' || s.sla_category === 'clinical_stalled',
  ).length;

  return (
    <div className="stack gap-4">
      <div className="section-head">
        <div>
          <h2>Operator SLA Monitor</h2>
          <p className="hint">
            Real-time tracking of delayed, unbooked, and stalled care requests across Lagos.
          </p>
        </div>
        <div className="cluster gap-2">
          <Pill tone="red">{breachedCount} Breached</Pill>
          <Pill tone="gold">{warningCount} Warnings</Pill>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <p>Analyzing care requests…</p>
        ) : stuck.length === 0 ? (
          <EmptyState title="All requests within SLA">
            No care requests are currently breaching response or booking SLA timers.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Patient</th>
                  <th>Category</th>
                  <th>Urgency</th>
                  <th>Age</th>
                  <th>Offers / Visits</th>
                  <th>SLA Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stuck.map((r) => {
                  const sla = slaCategory[r.sla_category];
                  const urg = urgency[r.urgency];
                  const hours = Math.floor(r.age_minutes / 60);
                  const mins = r.age_minutes % 60;
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>#{r.id}</strong>
                        <div className="hint">{formatDateTime(r.created_at)}</div>
                      </td>
                      <td>
                        {r.patient_name}
                        <div className="hint">{r.patient_email}</div>
                      </td>
                      <td>{r.category}</td>
                      <td>
                        <Pill tone={urg.tone}>{urg.label}</Pill>
                      </td>
                      <td>
                        {hours > 0 ? `${hours}h ` : ''}
                        {mins}m
                      </td>
                      <td>
                        {r.offers_count} offers · {r.appointments_count} visits
                      </td>
                      <td>
                        <Pill tone={sla.tone}>{sla.label}</Pill>
                      </td>
                      <td>
                        <Link to={`/patient/requests/${r.id}`} className="btn btn-ghost btn-sm">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
