import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/endpoints';
import { Card, EmptyState, Field } from '../../components/ui';
import { formatDateTime } from '../../lib/time';

export function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', actionFilter, entityFilter],
    queryFn: () =>
      api.auditLogs({
        action: actionFilter || undefined,
        entity_type: entityFilter || undefined,
      }),
  });

  const logs = data?.data ?? [];

  return (
    <div className="stack gap-4">
      <div className="section-head">
        <div>
          <h2>System Audit Trail</h2>
          <p className="hint">
            Immutable, append-only record of all write actions, status changes, and actors.
          </p>
        </div>
      </div>

      <Card>
        <div className="form-grid mb-4">
          <Field label="Filter by action">
            <input
              type="text"
              placeholder="e.g. OFFER_ACCEPTED"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
          </Field>
          <Field label="Filter by entity type">
            <input
              type="text"
              placeholder="e.g. care_request"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
            />
          </Field>
        </div>

        {isLoading ? (
          <p>Loading audit trail…</p>
        ) : logs.length === 0 ? (
          <EmptyState title="No audit entries">
            No actions match the selected filter criteria.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp (Lagos)</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                  <th>IP</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>
                      <span className="badge">{log.action}</span>
                    </td>
                    <td>
                      {log.entity_type} #{log.entity_id}
                    </td>
                    <td>
                      <div>{log.actor_name ?? 'System'}</div>
                      <div className="hint">{log.actor_email}</div>
                    </td>
                    <td>{log.ip_address ?? '—'}</td>
                    <td>
                      <code style={{ fontSize: '0.8rem' }}>
                        {log.metadata ? JSON.stringify(log.metadata) : '—'}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
