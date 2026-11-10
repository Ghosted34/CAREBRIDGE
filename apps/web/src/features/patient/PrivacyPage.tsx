import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import type { ConsentType } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import { Button, Card, ErrorNote, Notice, PageHeader, Pill, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/time';

/** Consent settings. Terms/privacy are fixed for account holders; data sharing and marketing can be changed. */
export function PrivacyPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const policies = useQuery({ queryKey: ['policies'], queryFn: api.policies, staleTime: Infinity });
  const consents = useQuery({ queryKey: ['consents'], queryFn: api.myConsents });
  const decide = useMutation({
    mutationFn: ({ type, granted }: { type: ConsentType; granted: boolean }) =>
      api.decideConsent(type, granted),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['consents'] });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  if (policies.isPending || consents.isPending) return <Spinner />;
  if (policies.isError || consents.isError)
    return <ErrorNote error={policies.error ?? consents.error} />;
  const statusByType = new Map(consents.data.data.map((c) => [c.type, c]));
  const withdrawn = decide.data?.data.withdrawn_requests ?? [];

  return (
    <>
      <PageHeader
        title="Privacy & consent"
        subtitle={
          <>
            Your choices about how CareLynk uses your information. Full summaries:{' '}
            <Link to="/policies">terms & privacy</Link>.
          </>
        }
      />
      {withdrawn.length > 0 && (
        <Notice tone="warn">
          Data sharing is off. {withdrawn.length} open request
          {withdrawn.length > 1 ? 's were' : ' was'} withdrawn from providers. Journeys where you
          already chose a provider continue.
        </Notice>
      )}
      <ErrorNote error={decide.error} />
      <div className="stack" style={{ marginTop: 12 }}>
        {policies.data.data
          .filter((p) => user?.role === 'patient' || p.type !== 'data_sharing')
          .map((p) => {
            const s = statusByType.get(p.type);
            const fixed = p.required_at_registration;
            return (
              <Card key={p.type}>
                <div className="card-head">
                  <div>
                    <h3>{p.title}</h3>
                    <div className="meta">
                      {s?.granted && s.decided_at && (
                        <span>Accepted {formatDateTime(s.decided_at)}</span>
                      )}
                      {s?.granted && !s.up_to_date && (
                        <Pill tone="gold">Updated — please review</Pill>
                      )}
                    </div>
                  </div>
                  <Pill tone={s?.up_to_date ? 'green' : 'grey'}>
                    {s?.up_to_date ? 'On' : s?.granted ? 'Outdated' : 'Off'}
                  </Pill>
                </div>
                <p className="muted">{p.summary}</p>
                <div className="btn-row">
                  {(!s?.up_to_date || !s.granted) && (
                    <Button
                      className="btn-sm"
                      busy={
                        decide.isPending &&
                        decide.variables?.type === p.type &&
                        decide.variables.granted
                      }
                      onClick={() => decide.mutate({ type: p.type, granted: true })}
                    >
                      {s?.granted ? 'Accept new version' : 'Turn on'}
                    </Button>
                  )}
                  {s?.granted && !fixed && (
                    <Button
                      variant="danger"
                      className="btn-sm"
                      busy={
                        decide.isPending &&
                        decide.variables?.type === p.type &&
                        !decide.variables.granted
                      }
                      onClick={() => {
                        const warning =
                          p.type === 'data_sharing'
                            ? 'Turn off data sharing? Requests still waiting for a provider will be withdrawn.'
                            : `Turn off "${p.title}"?`;
                        if (window.confirm(warning))
                          decide.mutate({ type: p.type, granted: false });
                      }}
                    >
                      Turn off
                    </Button>
                  )}
                  {fixed && <span className="muted small">Required to keep an account.</span>}
                </div>
              </Card>
            );
          })}
      </div>
    </>
  );
}
