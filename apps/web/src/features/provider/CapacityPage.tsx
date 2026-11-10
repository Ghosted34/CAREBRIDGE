import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import type { ProviderSchedule, ProviderSlot } from '../../api/types';
import { Button, Card, EmptyState, ErrorNote, Field, Modal, Pill } from '../../components/ui';
import { formatDateTime, toLagosLocal } from '../../lib/time';
import { slotStatus } from '../../lib/labels';
import { useActiveClinic } from './activeClinic';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function CapacityPage() {
  const queryClient = useQueryClient();
  const { clinicId } = useActiveClinic();
  const [centreId, setCentreId] = useState<string>('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => toLagosLocal(new Date()).slice(0, 10));
  const [endDate, setEndDate] = useState(() =>
    toLagosLocal(new Date(Date.now() + 14 * 86_400_000)).slice(0, 10),
  );

  const { data: centresData } = useQuery({
    queryKey: ['centres', clinicId],
    queryFn: () => (clinicId ? api.providerCentres(clinicId) : null),
    enabled: Boolean(clinicId),
  });
  const centres = centresData?.data ?? [];
  const activeCentre = centres.find((c) => c.id === Number(centreId || ''));

  const { data: schedulesData, isLoading: schedulesLoading } = useQuery({
    queryKey: ['centre-schedules', centreId],
    queryFn: () => (Number(centreId) > 0 ? api.providerCentreSchedules(Number(centreId)) : null),
    enabled: Number(centreId) > 0,
  });
  const schedules: ProviderSchedule[] = schedulesData?.data ?? [];

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['centre-slots', centreId],
    queryFn: () => (Number(centreId) > 0 ? api.providerCentreSlots(Number(centreId)) : null),
    enabled: Number(centreId) > 0,
  });
  const slots: ProviderSlot[] = slotsData?.data ?? [];

  const generate = useMutation({
    mutationFn: () =>
      api.generateCentreSlots(Number(centreId), {
        start_date: startDate,
        end_date: endDate,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['centre-slots', centreId] });
      setGenerateOpen(false);
    },
  });

  const cancelSlot = useMutation({
    mutationFn: (id: number) => api.cancelSlot(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['centre-slots', centreId] });
    },
  });

  return (
    <div className="stack gap-4">
      <div className="section-head">
        <div>
          <h2>Centre Capacity & Slots</h2>
          <p className="hint">
            Manage opening hours and real bookable appointment capacity for an operating centre.
          </p>
        </div>
      </div>

      {clinicId && centres.length > 1 && (
        <Field label="Operating centre">
          <select value={centreId} onChange={(e) => setCentreId(e.target.value)}>
            <option value="">-- Choose a centre --</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {clinicId && centres.length === 1 && (
        <Field label="Operating centre">
          <p className="muted small">
            {activeCentre?.name} — {activeCentre?.address}
          </p>
        </Field>
      )}

      {Number(centreId) > 0 && (
        <div className="grid col-2 gap-4">
          <Card>
            <h3 className="mb-2">Operating schedule</h3>
            {schedulesLoading ? (
              <p>Loading schedule…</p>
            ) : schedules.length === 0 ? (
              <EmptyState title="No operating hours configured">
                Configure opening hours for this centre to enable automated slot generation.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Hours</th>
                      <th>Slot duration</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.id}>
                        <td>{DAYS[s.day_of_week]}</td>
                        <td>
                          {s.open_time} – {s.close_time}
                        </td>
                        <td>{s.slot_duration_minutes} min</td>
                        <td>
                          <Pill tone={s.is_active ? 'green' : 'grey'}>
                            {s.is_active ? 'Active' : 'Closed'}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-2">Upcoming bookable slots</h3>
            {slotsLoading ? (
              <p>Loading slots…</p>
            ) : slots.length === 0 ? (
              <EmptyState title="No slots generated">
                Generate slots from your schedule so patients can pick real appointment times.
              </EmptyState>
            ) : (
              <div className="table-wrap" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time (Lagos)</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.slice(0, 50).map((slot) => {
                      const meta = slotStatus[slot.status];
                      return (
                        <tr key={slot.id}>
                          <td>{formatDateTime(slot.start_time)}</td>
                          <td>
                            <Pill tone={meta.tone}>{meta.label}</Pill>
                          </td>
                          <td>
                            {slot.status === 'available' && (
                              <Button
                                variant="ghost"
                                onClick={() => cancelSlot.mutate(slot.id)}
                                busy={cancelSlot.isPending}
                              >
                                Cancel
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {Number(centreId) > 0 && (
        <Modal
          open={generateOpen}
          title="Generate appointment slots"
          onClose={() => setGenerateOpen(false)}
        >
          <form
            className="form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              generate.mutate();
            }}
          >
            <p className="hint">
              Generates slots according to this centre&apos;s active weekly schedule.
            </p>
            <div className="form-grid">
              <Field label="Start date">
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            </div>
            <ErrorNote error={generate.error} />
            <div className="btn-row">
              <Button variant="ghost" onClick={() => setGenerateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" busy={generate.isPending}>
                Generate slots
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {clinicId && centres.length === 0 && (
        <EmptyState title="No operating centres yet">
          Add an operating centre first ( <Link to="/provider/centres">manage centres</Link>
          ), then configure its opening hours and slots here.
        </EmptyState>
      )}
    </div>
  );
}
