import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/endpoints';
import { Button, Card, EmptyState, ErrorNote, Field, Modal, Pill } from '../../components/ui';
import { formatDateTime, toLagosLocal } from '../../lib/time';
import { slotStatus } from '../../lib/labels';
import { useActiveClinic } from './activeClinic';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function CapacityPage() {
  const queryClient = useQueryClient();
  // Capacity follows the clinic picked in the topbar switcher.
  const { clinicId } = useActiveClinic();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => toLagosLocal(new Date()).slice(0, 10));
  const [endDate, setEndDate] = useState(() =>
    toLagosLocal(new Date(Date.now() + 14 * 86_400_000)).slice(0, 10),
  );

  const activeId = clinicId;

  const { data: schedulesData, isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules', activeId],
    queryFn: () => (activeId ? api.providerSchedules(activeId) : null),
    enabled: Boolean(activeId),
  });

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['slots', activeId],
    queryFn: () => (activeId ? api.providerSlots(activeId) : null),
    enabled: Boolean(activeId),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.generateSlots(activeId!, {
        start_date: startDate,
        end_date: endDate,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['slots', activeId] });
      setGenerateOpen(false);
    },
  });

  const cancelSlot = useMutation({
    mutationFn: (id: number) => api.cancelSlot(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['slots', activeId] });
    },
  });

  const schedules = schedulesData?.data ?? [];
  const slots = slotsData?.data ?? [];

  return (
    <div className="stack gap-4">
      <div className="section-head">
        <div>
          <h2>Clinic Capacity & Slots</h2>
          <p className="hint">Manage operating hours and real bookable appointment capacity.</p>
        </div>
        <div className="cluster gap-2">
          <Button onClick={() => setGenerateOpen(true)} disabled={!activeId}>
            Generate slots
          </Button>
        </div>
      </div>

      <div className="grid col-2 gap-4">
        <Card>
          <h3 className="mb-2">Operating schedule</h3>
          {schedulesLoading ? (
            <p>Loading schedule…</p>
          ) : schedules.length === 0 ? (
            <EmptyState title="No operating hours configured">
              Configure opening hours for this clinic to enable automated slot generation.
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
            Generates slots according to this clinic&apos;s active weekly schedule.
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
    </div>
  );
}
