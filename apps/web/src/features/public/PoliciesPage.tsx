import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { Card, ErrorNote, PageHeader, Pill, Spinner } from '../../components/ui';

/** Plain-language summaries of each policy and its current version. */
export function PoliciesPage() {
  const q = useQuery({ queryKey: ['policies'], queryFn: api.policies, staleTime: Infinity });
  return (
    <>
      <PageHeader
        title="Terms & privacy"
        subtitle="What you agree to when you use OnDiGoH, in plain language."
      />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : (
        <div className="stack">
          {q.data.data.map((p) => (
            <Card key={p.type}>
              <div className="card-head">
                <h2 id={p.type}>{p.title}</h2>
                <Pill tone="grey">Version {p.version}</Pill>
              </div>
              <p>{p.summary}</p>
              <p className="muted small">
                {p.required_at_registration
                  ? 'Required to have an account.'
                  : p.required_for_requests
                    ? 'Required before you send a care request. You can withdraw it at any time.'
                    : 'Optional. You can change this at any time.'}
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
