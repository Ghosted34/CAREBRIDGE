import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/endpoints';
import type { QueueItem } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Notice,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { requestStatus, titleCase, urgency } from '../../lib/labels';
import { formatDateTime } from '../../lib/time';
import { useOfferableProviders } from './useOfferableProviders';

export function QueuePage() {
  const { user } = useAuth();
  const isOps = user?.role !== 'provider_staff';
  const queue = useQuery({ queryKey: ['requests', 'queue'], queryFn: () => api.queue() });
  const offers = useQuery({ queryKey: ['offers', 'mine'], queryFn: api.myOffers });
  const offeredIds = new Set((offers.data?.data ?? []).map((o) => o.care_request_id));
  const [target, setTarget] = useState<QueueItem | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const noMemberships = !isOps && (user?.memberships.length ?? 0) === 0;

  return (
    <>
      <PageHeader
        title="Request queue"
        subtitle={
          isOps
            ? 'All open requests across the network, most urgent first. You can offer on behalf of any verified provider.'
            : 'Open requests that match your clinic’s specialties and area, most urgent first.'
        }
      />
      {noMemberships && (
        <Notice tone="warn">
          Your account isn’t linked to a verified provider yet, so no requests are shown. Contact
          CareBridge to finish onboarding.
        </Notice>
      )}
      {sent && (
        <Notice tone="success">
          Offer sent for request #{sent}. The patient will be able to choose it.
        </Notice>
      )}
      {queue.isPending ? (
        <Spinner />
      ) : queue.isError ? (
        <ErrorNote error={queue.error} />
      ) : queue.data.data.length === 0 ? (
        <EmptyState title="The queue is clear">New matching requests will appear here.</EmptyState>
      ) : (
        <div className="stack" style={{ marginTop: 12 }}>
          {queue.data.data.map((r) => (
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
                {offeredIds.has(r.id) && !isOps ? (
                  <Pill tone="teal">You’ve made an offer</Pill>
                ) : (
                  <Button onClick={() => setTarget(r)}>Make an offer</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <OfferModal
        request={target}
        onClose={() => setTarget(null)}
        onSent={(id) => {
          setTarget(null);
          setSent(id);
        }}
      />
    </>
  );
}

function OfferModal({
  request,
  onClose,
  onSent,
}: {
  request: QueueItem | null;
  onClose: () => void;
  onSent: (requestId: number) => void;
}) {
  const queryClient = useQueryClient();
  const all = useOfferableProviders();
  const providers = request
    ? all.filter((p) => !p.specialties || p.specialties.includes(request.specialty))
    : all;
  const [providerId, setProviderId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const chosen = providerId || providers[0]?.id;

  const offer = useMutation({
    mutationFn: () =>
      api.makeOffer(request!.id, { provider_id: Number(chosen), message: message || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['offers'] });
      setMessage('');
      onSent(request!.id);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    offer.mutate();
  };

  return (
    <Modal open={!!request} title={`Offer for request #${request?.id ?? ''}`} onClose={onClose}>
      {providers.length === 0 ? (
        <Notice tone="warn">
          You can’t make offers yet: you need an owner, clinician or scheduler role at a verified
          provider.
        </Notice>
      ) : (
        <form className="form" onSubmit={submit}>
          {providers.length === 1 ? (
            // One clinic: nothing to choose, so just say who the offer is from.
            <p className="small">
              Offering as <strong>{providers[0]!.name}</strong>
            </p>
          ) : (
            <Field label="Offer on behalf of">
              <select value={chosen} onChange={(e) => setProviderId(Number(e.target.value))}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label="Message to the patient"
            hint="Availability, what to expect at the first visit. No pricing promises."
          >
            <textarea
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          <ErrorNote error={offer.error} />
          <div className="btn-row">
            <Button type="submit" busy={offer.isPending}>
              Send offer
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
