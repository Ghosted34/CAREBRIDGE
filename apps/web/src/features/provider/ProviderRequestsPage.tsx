import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import type { AssignedRequest } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import { Link } from 'react-router';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { requestStatus, titleCase, urgency } from '../../lib/labels';
import { formatDateTime } from '../../lib/time';
import { useActiveClinic } from './activeClinic';

/**
 * Read-only list of care requests assigned to the active clinic.
 * Replaces the old offer-based QueuePage: providers no longer make offers —
 * patients pick them directly, so staff just see what's been assigned and can
 * confirm/decline appointments from the appointments page.
 */
export function ProviderRequestsPage() {
  const { user } = useAuth();
  const { clinicId } = useActiveClinic();
  const isOps = user?.role === 'operator' || user?.role === 'admin';

  const q = useQuery({
    queryKey: ['requests', 'assigned', clinicId],
    queryFn: () => api.assigned({ provider_id: clinicId }),
    enabled: Boolean(clinicId),
  });

  return (
    <>
      <PageHeader
        title="Requests for my clinic"
        subtitle={
          isOps
            ? 'All requests assigned to any verified provider.'
            : 'Requests assigned to this clinic. Open one to confirm or decline appointments.'
        }
      />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="No requests assigned">
          When a patient picks your clinic, the request appears here.
        </EmptyState>
      ) : (
        <div className="stack" style={{ marginTop: 12 }}>
          {q.data.data.map((r: AssignedRequest) => (
            <Card key={r.id}>
              <div className="card-head">
                <div>
                  <h3>
                    {titleCase(r.specialty)} · {r.service_type}
                  </h3>
                  <div className="meta">
                    <span>#{r.id}</span>
                    <span>{r.preferred_city}</span>
                    <span>{formatDateTime(r.created_at)}</span>
                    <Pill tone={requestStatus[r.status].tone}>{requestStatus[r.status].label}</Pill>
                  </div>
                </div>
                <Pill tone={urgency[r.urgency].tone}>{urgency[r.urgency].label}</Pill>
              </div>
              <div className="quote">{r.description}</div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <Link to="/provider/appointments">
                  <Button variant="ghost">View appointments</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
