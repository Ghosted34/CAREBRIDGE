import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { offerStatus, titleCase, urgency } from '../../lib/labels';
import { formatDateTime } from '../../lib/time';
import { useActiveClinic } from './activeClinic';

export function ProviderOffersPage() {
  const queryClient = useQueryClient();
  const { clinicId } = useActiveClinic();
  const q = useQuery({
    queryKey: ['offers', 'mine', clinicId],
    queryFn: () => api.myOffers({ provider_id: clinicId }),
  });
  const withdraw = useMutation({
    mutationFn: (id: number) => api.withdrawOffer(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['offers'] }),
  });

  return (
    <>
      <PageHeader
        title="Offers"
        subtitle="Offers your clinic has made and what patients decided."
      />
      <ErrorNote error={withdraw.error} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="No offers yet">Make offers from the request queue.</EmptyState>
      ) : (
        <Card>
          <ul className="list">
            {q.data.data.map((o) => (
              <li className="list-item" key={o.id}>
                <div className="list-item-main">
                  <div className="list-item-title">
                    {titleCase(o.specialty)} · {o.service_type}
                  </div>
                  <div className="meta">
                    <span>Request #{o.care_request_id}</span>
                    <span>{o.provider}</span>
                    <span>{formatDateTime(o.offered_at)}</span>
                    <Pill tone={urgency[o.urgency].tone}>{urgency[o.urgency].label}</Pill>
                  </div>
                </div>
                <div className="btn-row">
                  <Pill tone={offerStatus[o.status].tone}>{offerStatus[o.status].label}</Pill>
                  {o.status === 'offered' && (
                    <Button
                      variant="ghost"
                      className="btn-sm"
                      onClick={() => withdraw.mutate(o.id)}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
