import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AppointmentVerb } from '../../api/endpoints';
import type { AppointmentStatus } from '../../api/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { appointmentStatus, appointmentType } from '../../lib/labels';
import { formatTimeRange } from '../../lib/time';
import { useActiveClinic } from './activeClinic';

const ACTIONS: Partial<
  Record<
    AppointmentStatus,
    { verb: AppointmentVerb; label: string; variant?: 'ghost' | 'danger' }[]
  >
> = {
  requested: [
    { verb: 'confirm', label: 'Confirm' },
    { verb: 'decline', label: 'Decline', variant: 'danger' },
  ],
  booked: [
    { verb: 'confirm', label: 'Confirm' },
    { verb: 'cancel', label: 'Cancel', variant: 'danger' },
  ],
  confirmed: [
    { verb: 'check-in', label: 'Check in' },
    { verb: 'no-show', label: 'No-show', variant: 'ghost' },
    { verb: 'cancel', label: 'Cancel', variant: 'danger' },
  ],
  checked_in: [{ verb: 'complete', label: 'Complete' }],
};

export function ProviderAppointmentsPage() {
  const queryClient = useQueryClient();
  const { clinicId } = useActiveClinic();
  const q = useQuery({
    queryKey: ['appointments', 'mine', clinicId],
    queryFn: () => api.myAppointments({ provider_id: clinicId }),
  });
  const act = useMutation({
    mutationFn: ({ id, verb }: { id: number; verb: AppointmentVerb }) =>
      api.appointmentAction(id, verb),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  return (
    <>
      <PageHeader title="Appointments" subtitle="Upcoming first. All times are Lagos time." />
      <ErrorNote error={act.error} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="No appointments yet" />
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Patient</th>
                  <th>Type</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {q.data.data.map((a) => (
                  <tr key={a.id}>
                    <td>{formatTimeRange(a.starts_at, a.ends_at)}</td>
                    <td>
                      {a.patient_name}
                      <div className="muted small">Request #{a.care_request_id}</div>
                    </td>
                    <td>{appointmentType[a.appointment_type]}</td>
                    <td>{a.provider}</td>
                    <td>
                      <Pill tone={appointmentStatus[a.status].tone}>
                        {appointmentStatus[a.status].label}
                      </Pill>
                    </td>
                    <td>
                      <div className="btn-row">
                        {(ACTIONS[a.status] ?? []).map((x) => (
                          <Button
                            key={x.verb}
                            variant={x.variant ?? 'secondary'}
                            className="btn-sm"
                            busy={
                              act.isPending &&
                              act.variables?.id === a.id &&
                              act.variables.verb === x.verb
                            }
                            onClick={() => act.mutate({ id: a.id, verb: x.verb })}
                          >
                            {x.label}
                          </Button>
                        ))}
                      </div>
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
