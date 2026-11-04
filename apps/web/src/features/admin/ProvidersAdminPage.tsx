import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { AdminProvider, Provider, ProviderRole, VerificationStatus } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { providerRole, titleCase, verificationStatus } from '../../lib/labels';

export function ProvidersAdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<VerificationStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const [membersOf, setMembersOf] = useState<AdminProvider | null>(null);
  const q = useQuery({
    queryKey: ['admin', 'providers', filter],
    queryFn: () => api.adminProviders({ verification_status: filter || undefined }),
  });
  const verify = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'verified' | 'rejected' | 'suspended' }) =>
      api.setVerification(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <>
      <PageHeader
        title="Providers"
        subtitle="Verify facilities before they can appear publicly or receive patients."
        actions={
          <>
            <Field label="Show">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as VerificationStatus | '')}
              >
                <option value="">All</option>
                {(Object.keys(verificationStatus) as VerificationStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {verificationStatus[s].label}
                  </option>
                ))}
              </select>
            </Field>
            {isAdmin && <Button onClick={() => setCreating(true)}>Add provider</Button>}
          </>
        }
      />
      <ErrorNote error={verify.error} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="No providers match" />
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Registration</th>
                  <th>Specialties</th>
                  <th>Staff</th>
                  <th>Status</th>
                  {isAdmin && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {q.data.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.display_name}</strong>
                      <div className="muted small">
                        {titleCase(p.provider_type)} · {p.address}
                      </div>
                    </td>
                    <td>
                      {p.registration_number}
                      <div className="muted small">{p.legal_name}</div>
                    </td>
                    <td>
                      <div className="tag-list">
                        {p.specialties.map((s) => (
                          <Pill key={s} tone="teal">
                            {titleCase(s)}
                          </Pill>
                        ))}
                      </div>
                    </td>
                    <td>{p.member_count}</td>
                    <td>
                      <Pill tone={verificationStatus[p.verification_status].tone}>
                        {verificationStatus[p.verification_status].label}
                      </Pill>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="btn-row">
                          {p.verification_status !== 'verified' && (
                            <Button
                              className="btn-sm"
                              onClick={() => verify.mutate({ id: p.id, status: 'verified' })}
                            >
                              Verify
                            </Button>
                          )}
                          {p.verification_status === 'pending' && (
                            <Button
                              variant="danger"
                              className="btn-sm"
                              onClick={() => verify.mutate({ id: p.id, status: 'rejected' })}
                            >
                              Reject
                            </Button>
                          )}
                          {p.verification_status === 'verified' && (
                            <Button
                              variant="danger"
                              className="btn-sm"
                              onClick={() => verify.mutate({ id: p.id, status: 'suspended' })}
                            >
                              Suspend
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="btn-sm"
                            onClick={() => setMembersOf(p)}
                          >
                            Staff
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <CreateProviderModal open={creating} onClose={() => setCreating(false)} />
      <MembersModal provider={membersOf} onClose={() => setMembersOf(null)} />
    </>
  );
}

const EMPTY = {
  legal_name: '',
  display_name: '',
  provider_type: 'clinic' as Provider['provider_type'],
  registration_number: '',
  city: 'Lagos',
  address: '',
  specialties: 'dentistry',
};

function CreateProviderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const create = useMutation({
    mutationFn: () =>
      api.createProvider({
        ...form,
        specialties: form.specialties
          .split(',')
          .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
          .filter(Boolean),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      setForm(EMPTY);
      onClose();
    },
  });
  const fe = create.error instanceof ApiError ? create.error.fieldErrors() : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <Modal open={open} title="Add provider" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Display name" error={fe.display_name?.[0]}>
            <input required value={form.display_name} onChange={set('display_name')} />
          </Field>
          <Field label="Legal name" error={fe.legal_name?.[0]}>
            <input required value={form.legal_name} onChange={set('legal_name')} />
          </Field>
          <Field label="Type">
            <select value={form.provider_type} onChange={set('provider_type')}>
              <option value="clinic">Clinic</option>
              <option value="hospital">Hospital</option>
              <option value="specialist">Specialist</option>
              <option value="diagnostic_centre">Diagnostic centre</option>
            </select>
          </Field>
          <Field
            label="Registration number"
            hint="e.g. MDCN / state facility registration"
            error={fe.registration_number?.[0]}
          >
            <input
              required
              value={form.registration_number}
              onChange={set('registration_number')}
            />
          </Field>
          <Field label="Address" className="span-2" error={fe.address?.[0]}>
            <input required value={form.address} onChange={set('address')} />
          </Field>
          <Field
            label="Specialties"
            hint="Comma separated, e.g. dentistry, endodontics"
            className="span-2"
            error={fe.specialties?.[0]}
          >
            <input required value={form.specialties} onChange={set('specialties')} />
          </Field>
        </div>
        {Object.keys(fe).length === 0 && <ErrorNote error={create.error} />}
        <p className="muted small">
          New providers start as “pending review” and are hidden until verified.
        </p>
        <div className="btn-row">
          <Button type="submit" busy={create.isPending}>
            Create provider
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MembersModal({
  provider,
  onClose,
}: {
  provider: AdminProvider | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const id = provider?.id ?? 0;
  const members = useQuery({
    queryKey: ['admin', 'members', id],
    queryFn: () => api.members(id),
    enabled: !!provider,
  });
  const staff = useQuery({
    queryKey: ['admin', 'users', 'staff'],
    queryFn: () => api.users({ role: 'provider_staff', status: 'active' }),
    enabled: !!provider,
  });
  const [userId, setUserId] = useState<number | ''>('');
  const [role, setRole] = useState<ProviderRole>('clinician');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin'] });
  const add = useMutation({
    mutationFn: () => api.addMember(id, Number(userId), role),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (uid: number) => api.removeMember(id, uid),
    onSuccess: refresh,
  });
  const memberIds = new Set((members.data?.data ?? []).map((m) => m.user_id));
  const candidates = (staff.data?.data ?? []).filter((u) => !memberIds.has(u.id));

  return (
    <Modal open={!!provider} title={`Staff · ${provider?.display_name ?? ''}`} onClose={onClose}>
      {members.isPending ? (
        <Spinner />
      ) : (members.data?.data.length ?? 0) === 0 ? (
        <p className="muted">No staff linked yet.</p>
      ) : (
        <ul className="list">
          {members.data!.data.map((m) => (
            <li className="list-item" key={m.user_id}>
              <div className="list-item-main">
                <div className="list-item-title">{m.full_name}</div>
                <div className="meta">
                  {m.email} · {providerRole[m.provider_role]}
                </div>
              </div>
              <Button variant="danger" className="btn-sm" onClick={() => remove.mutate(m.user_id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <h3 style={{ marginTop: 16 }}>Link a staff member</h3>
      <p className="muted small">
        Only active provider-staff accounts are listed. Approve new sign-ups under Users first.
      </p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label="Staff account">
          <select required value={userId} onChange={(e) => setUserId(Number(e.target.value))}>
            <option value="">Choose…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role at this provider">
          <select value={role} onChange={(e) => setRole(e.target.value as ProviderRole)}>
            {(Object.keys(providerRole) as ProviderRole[]).map((r) => (
              <option key={r} value={r}>
                {providerRole[r]}
              </option>
            ))}
          </select>
        </Field>
        <div className="span-2">
          <ErrorNote error={add.error ?? remove.error} />
          <Button type="submit" busy={add.isPending} disabled={!userId}>
            Link staff member
          </Button>
        </div>
      </form>
    </Modal>
  );
}
