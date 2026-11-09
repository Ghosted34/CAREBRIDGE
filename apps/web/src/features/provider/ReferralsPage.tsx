import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/endpoints';
import type { ReferralStatus } from '../../api/types';
import { Button, Card, EmptyState, ErrorNote, Pill } from '../../components/ui';
import { referralStatus } from '../../lib/labels';
import { formatDate } from '../../lib/time';

export function ReferralsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');

  const { data, isLoading } = useQuery({
    queryKey: ['referrals', tab],
    queryFn: () => api.myReferrals({ type: tab }),
  });

  const accept = useMutation({
    mutationFn: (id: number) => api.acceptReferral(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['referrals'] }),
  });

  const decline = useMutation({
    mutationFn: (id: number) => api.declineReferral(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['referrals'] }),
  });

  const complete = useMutation({
    mutationFn: (id: number) => api.completeReferral(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['referrals'] }),
  });

  const referrals = data?.data ?? [];

  return (
    <div className="stack gap-4">
      <div className="section-head">
        <div>
          <h2>Clinical Referrals</h2>
          <p className="hint">
            Specialist referrals and clinical handoffs between verified healthcare facilities.
          </p>
        </div>
        <div className="cluster gap-2">
          <Button
            variant={tab === 'incoming' ? 'primary' : 'ghost'}
            onClick={() => setTab('incoming')}
          >
            Incoming referrals
          </Button>
          <Button
            variant={tab === 'outgoing' ? 'primary' : 'ghost'}
            onClick={() => setTab('outgoing')}
          >
            Outgoing referrals
          </Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <p>Loading referrals…</p>
        ) : referrals.length === 0 ? (
          <EmptyState title={`No ${tab} referrals`}>
            {tab === 'incoming'
              ? 'Your clinic has not received any specialist referrals yet.'
              : 'Your clinic has not referred any patients to specialists yet.'}
          </EmptyState>
        ) : (
          <div className="stack gap-3">
            {referrals.map((r) => {
              const meta = referralStatus[r.status as ReferralStatus] ?? {
                label: r.status,
                tone: 'grey',
              };
              return (
                <div key={r.id} className="card stack gap-2 p-3">
                  <div className="cluster justify-between items-center">
                    <div className="cluster gap-2 items-center">
                      <span className="badge">Request #{r.care_request_id}</span>
                      <strong>{r.referred_specialty}</strong>
                      <span className="hint">
                        {tab === 'incoming'
                          ? `From: ${r.referring_provider}`
                          : `To: ${r.receiving_provider}`}
                      </span>
                    </div>
                    <div className="cluster gap-2 items-center">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                      <span className="hint">{formatDate(r.created_at)}</span>
                    </div>
                  </div>

                  <div
                    className="p-2"
                    style={{
                      background: 'var(--surface-sunken)',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <p className="hint mb-1">
                      <strong>Clinical Summary:</strong>
                    </p>
                    <p>{r.clinical_summary}</p>
                  </div>

                  {tab === 'incoming' && r.status === 'sent' && (
                    <div className="cluster gap-2 justify-end">
                      <Button
                        variant="ghost"
                        onClick={() => decline.mutate(r.id)}
                        busy={decline.isPending}
                      >
                        Decline
                      </Button>
                      <Button onClick={() => accept.mutate(r.id)} busy={accept.isPending}>
                        Accept referral
                      </Button>
                    </div>
                  )}

                  {tab === 'incoming' && r.status === 'accepted' && (
                    <div className="cluster gap-2 justify-end">
                      <Button onClick={() => complete.mutate(r.id)} busy={complete.isPending}>
                        Mark referral completed
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <ErrorNote error={accept.error ?? decline.error ?? complete.error} />
    </div>
  );
}
