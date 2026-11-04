import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/endpoints';
import type { Role, UserStatus } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import type { Tone } from '../../lib/labels';
import { titleCase } from '../../lib/labels';
import { formatDate } from '../../lib/time';

const STATUS_TONE: Record<UserStatus, Tone> = {
  pending: 'gold',
  active: 'green',
  suspended: 'red',
};

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<UserStatus | ''>('pending');
  const [role, setRole] = useState<Role | ''>('');
  const q = useQuery({
    queryKey: ['admin', 'users', status, role],
    queryFn: () => api.users({ status: status || undefined, role: role || undefined }),
  });
  const setUserStatus = useMutation({
    mutationFn: ({ id, to }: { id: number; to: 'active' | 'suspended' }) =>
      api.setUserStatus(id, to),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Approve provider staff sign-ups, then link them to their provider under Providers → Staff."
        actions={
          <>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as UserStatus | '')}>
                <option value="">Any</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </Field>
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
                <option value="">Any</option>
                <option value="patient">Patient</option>
                <option value="provider_staff">Provider staff</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
          </>
        }
      />
      <ErrorNote error={setUserStatus.error} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="No users match these filters" />
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {q.data.data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.full_name}</strong>
                    </td>
                    <td>
                      {u.email}
                      <div className="muted small">{u.phone}</div>
                    </td>
                    <td>{titleCase(u.role)}</td>
                    <td>{formatDate(u.created_at)}</td>
                    <td>
                      <Pill tone={STATUS_TONE[u.status]}>{titleCase(u.status)}</Pill>
                    </td>
                    <td>
                      {u.id !== me?.id && (
                        <div className="btn-row">
                          {u.status !== 'active' && (
                            <Button
                              className="btn-sm"
                              onClick={() => setUserStatus.mutate({ id: u.id, to: 'active' })}
                            >
                              {u.status === 'pending' ? 'Approve' : 'Reactivate'}
                            </Button>
                          )}
                          {u.status === 'active' && (
                            <Button
                              variant="danger"
                              className="btn-sm"
                              onClick={() => setUserStatus.mutate({ id: u.id, to: 'suspended' })}
                            >
                              Suspend
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
