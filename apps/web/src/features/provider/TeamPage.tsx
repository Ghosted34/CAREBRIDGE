import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { ProviderRole, TeamRole } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Notice,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { providerRole, verificationStatus } from '../../lib/labels';
import { useActiveClinic } from './activeClinic';

const TEAM_ROLES: TeamRole[] = ['clinician', 'scheduler', 'receptionist'];

/**
 * Clinic team, managed by the clinic itself. Owners add, invite and remove their own
 * clinician/scheduler/receptionist staff once OnDiGoH has verified the facility —
 * no admin ticket needed. The API enforces the same rule.
 */
export function TeamPage() {
  const { user } = useAuth();
  const { clinicId } = useActiveClinic();
  // All memberships, including a clinic still awaiting verification: that is exactly the case
  // this page has to explain. The topbar switcher only offers verified clinics.
  const clinics = user?.memberships ?? [];
  const queryClient = useQueryClient();
  // `term` is what is typed; `search` is what has been submitted to the API (on blur), so a
  // request goes out once per search rather than once per keystroke.
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<number | ''>('');
  const [role, setRole] = useState<TeamRole>('clinician');

  const clinic = clinics.find((m) => m.provider_id === clinicId) ?? clinics[0];
  const isOwner = clinic?.provider_role === 'owner';
  const providerId = clinic?.provider_id;

  const team = useQuery({
    queryKey: ['team', providerId],
    queryFn: () => api.team(providerId!),
    enabled: !!providerId,
  });
  const staff = useQuery({
    queryKey: ['staff-accounts', search],
    queryFn: () => api.staffAccounts(search),
    enabled: !!providerId && isOwner && search.length >= 2,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['team'] });
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };
  const add = useMutation({
    mutationFn: () => api.addTeamMember(providerId!, Number(userId), role),
    onSuccess: () => {
      setUserId('');
      setTerm('');
      setSearch('');
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.removeTeamMember(providerId!, id),
    onSuccess: refresh,
  });

  if (!clinic) {
    return (
      <>
        <PageHeader title="Clinic team" />
        <Notice tone="warn">
          Your account isn’t linked to a verified clinic yet, so there is no team to manage.
        </Notice>
      </>
    );
  }

  const members = team.data?.data ?? [];
  const memberIds = new Set(members.map((m) => m.user_id));
  const candidates = (staff.data?.data ?? []).filter((u) => !memberIds.has(u.id));
  const fieldErrors = add.error instanceof ApiError ? add.error.fieldErrors() : {};

  return (
    <>
      <PageHeader
        title="Clinic team"
        subtitle={`${clinic.display_name} · you are ${providerRole[clinic.provider_role].toLowerCase()}`}
        actions={
          <Pill tone={verificationStatus[clinic.verification_status].tone}>
            {verificationStatus[clinic.verification_status].label}
          </Pill>
        }
      />
      {clinic.verification_status !== 'verified' ? (
        <Notice tone="warn">
          Your facility is awaiting OnDiGoH verification. Team management unlocks as soon as it is
          verified.
        </Notice>
      ) : (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <Card>
            <h2>Team members</h2>
            {team.isPending ? (
              <Spinner />
            ) : members.length === 0 ? (
              <EmptyState title="Nobody linked yet">Add your first team member.</EmptyState>
            ) : (
              <ul className="list">
                {members.map((m) => (
                  <li className="list-item" key={m.user_id}>
                    <div className="list-item-main">
                      <div className="list-item-title">{m.full_name}</div>
                      <div className="meta">
                        <span>{m.email}</span>
                        <Pill tone={m.provider_role === 'owner' ? 'teal' : 'grey'}>
                          {providerRole[m.provider_role]}
                        </Pill>
                        {m.status !== 'active' && <Pill tone="gold">Awaiting first sign-in</Pill>}
                      </div>
                    </div>
                    {isOwner && m.provider_role !== 'owner' && m.user_id !== user?.id && (
                      <Button
                        variant="danger"
                        className="btn-sm"
                        busy={remove.isPending && remove.variables === m.user_id}
                        onClick={() => remove.mutate(m.user_id)}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <ErrorNote error={remove.error} />
          </Card>

          <Card>
            <h2>Add or invite</h2>
            {!isOwner ? (
              <p className="muted small">
                Only the clinic owner can add or remove team members. Ask your owner if someone
                needs access.
              </p>
            ) : (
              <form
                className="form"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  add.mutate();
                }}
              >
                <Field
                  label="Find a staff account"
                  hint="Search by name or email. They must have registered as clinic / provider staff."
                >
                  <input
                    type="search"
                    value={term}
                    placeholder="name or email"
                    onChange={(e) => setTerm(e.target.value)}
                    onBlur={() => setSearch(term.trim())}
                  />
                </Field>
                <Field label="Staff account" error={fieldErrors.user_id?.[0]}>
                  <select
                    required
                    value={userId}
                    onChange={(e) => setUserId(Number(e.target.value))}
                  >
                    <option value="">{search.length < 2 ? 'Search first…' : 'Choose…'}</option>
                    {candidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.email})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Role in your clinic">
                  <select value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
                    {TEAM_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {providerRole[r as ProviderRole]}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="muted small">
                  Invited accounts that are still pending approval are activated straight away and
                  notified by email.
                </p>
                <ErrorNote error={add.error} />
                <Button type="submit" busy={add.isPending} disabled={!userId}>
                  Add to team
                </Button>
              </form>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
