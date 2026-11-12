import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import { Card, EmptyState, ErrorNote, Field, PageHeader, Pill, Spinner } from '../../components/ui';
import { titleCase } from '../../lib/labels';

const SPECIALTIES = ['dentistry', 'endodontics', 'orthodontics', 'periodontics', 'oral_surgery'];

export function ProvidersPage() {
  const [specialty, setSpecialty] = useState('dentistry');
  const q = useQuery({
    queryKey: ['providers', specialty],
    queryFn: () => api.providers({ specialty, city: 'Lagos' }),
  });

  return (
    <>
      <PageHeader
        title="Verified providers"
        subtitle="Every provider listed has been checked by CareLynk. Found the right one? Send
          your request straight to them."
      />
      <Card>
        <div className="form-grid">
          <Field label="Specialty">
            <select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
              {SPECIALTIES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City">
            <select disabled value="Lagos">
              <option>Lagos</option>
            </select>
          </Field>
        </div>
      </Card>
      <h2 className="section-title">{q.data ? `${q.data.data.length} found` : 'Results'}</h2>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="No verified providers for this specialty yet">
          More providers join every week.
        </EmptyState>
      ) : (
        <div className="grid grid-2">
          {q.data.data.map((p) => (
            <div className="card" key={p.id}>
              <div className="card-head">
                <div>
                  <h3>{p.display_name}</h3>
                  <div className="muted small">{p.address}</div>
                </div>
                <Pill tone="green">Verified</Pill>
              </div>
              <div className="tag-list">
                {p.specialties.map((s) => (
                  <Pill key={s} tone="teal">
                    {titleCase(s)}
                  </Pill>
                ))}
                {!p.accepting_referrals && <Pill tone="grey">Not taking new patients</Pill>}
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                {/* Opens booking with results narrowed to this clinic. */}
                <Link to={`/patient/new?providerId=${p.id}`} className="btn btn-primary btn-sm">
                  Book here
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
