import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api/endpoints';
import type { Centre } from '../../api/types';
import { Button, Card, EmptyState, ErrorNote, Field, Modal, Pill } from '../../components/ui';
import { formatDateTime, toLagosLocal } from '../../lib/time';
import { slotStatus } from '../../lib/labels';
import { useActiveClinic } from './activeClinic';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type DayScheduleInput = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  slot_duration_minutes: number;
  is_active: boolean;
};

export function CapacityPage() {
  const queryClient = useQueryClient();
  // Capacity follows the clinic picked in the topbar switcher.
  const { clinicId } = useActiveClinic();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => toLagosLocal(new Date()).slice(0, 10));
  const [endDate, setEndDate] = useState(() =>
    toLagosLocal(new Date(Date.now() + 14 * 86_400_000)).slice(0, 10),
  );

  const activeId = clinicId;
  const [selectedCentreId, setSelectedCentreId] = useState<number | null>(null);

  const { data: centresData } = useQuery({
    queryKey: ['centres', activeId],
    queryFn: () => (activeId ? api.centres(activeId) : null),
    enabled: Boolean(activeId),
  });

  const centres = centresData?.data ?? [];

  const { data: schedulesData, isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules', activeId, selectedCentreId],
    queryFn: () =>
      activeId && selectedCentreId
        ? api.providerSchedulesByCentre(activeId, selectedCentreId)
        : null,
    enabled: Boolean(activeId) && Boolean(selectedCentreId),
  });

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['slots', activeId],
    queryFn: () => (activeId ? api.providerSlots(activeId) : null),
    enabled: Boolean(activeId),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.generateSlots(activeId!, selectedCentreId!, {
        start_date: startDate,
        end_date: endDate,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['slots', activeId] });
      setGenerateOpen(false);
    },
  });

  const setSchedules = useMutation({
    mutationFn: () => api.setProviderSchedules(activeId!, selectedCentreId!, daySchedules),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules', activeId] });
      setEditOpen(false);
    },
  });

  const cancelSlot = useMutation({
    mutationFn: (id: number) => api.cancelSlot(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['slots', activeId] });
    },
  });

  const schedules = useMemo(() => schedulesData?.data ?? [], [schedulesData]);
  const slots = slotsData?.data ?? [];

  // Base schedules fetched from the API, keyed by day_of_week.
  const baseSchedules = useMemo(
    () =>
      DAYS.map((_, dayIndex): DayScheduleInput => {
        const existing = schedules.find((s) => s.day_of_week === dayIndex);
        return {
          day_of_week: dayIndex,
          open_time: existing?.open_time ?? '09:00',
          close_time: existing?.close_time ?? '17:00',
          slot_duration_minutes: existing?.slot_duration_minutes ?? 30,
          is_active: Boolean(existing?.is_active ?? true),
        };
      }),
    [schedules],
  );

  // User edits layered on top of the base schedules.
  const [edits, setEdits] = useState<Map<number, Partial<DayScheduleInput>>>(new Map());

  const daySchedules = baseSchedules.map((s) => ({
    ...s,
    ...edits.get(s.day_of_week),
  }));

  const updateDay = (dayOfWeek: number, key: string, value: string | number | boolean) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(dayOfWeek) ?? {};
      next.set(dayOfWeek, { ...current, [key]: value });
      return next;
    });
  };

  return (
    <div className="stack gap-4">
      <div className="section-head">
        <div>
          <h2>Clinic Capacity & Slots</h2>
          <p className="hint">Manage operating hours and real bookable appointment capacity.</p>
        </div>
        <div className="cluster gap-2">
          {centres.length > 0 ? (
            <Field label="Centre">
              <select
                required
                value={selectedCentreId == null ? '' : String(selectedCentreId)}
                onChange={(e) => setSelectedCentreId(Number(e.target.value) || null)}
              >
                <option value="">Select a centre…</option>
                {centres.map((c: Centre) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Button onClick={() => setEditOpen(true)} disabled={!selectedCentreId}>
            Edit hours
          </Button>
          <Button onClick={() => setGenerateOpen(true)} disabled={!selectedCentreId}>
            Generate slots
          </Button>
        </div>
      </div>

      <div className="grid col-2 gap-4">
        <Card>
          <h3 className="mb-2">Operating schedule</h3>
          {selectedCentreId === null ? (
            <EmptyState title="Select a centre">
              Pick a centre above to view and edit its operating hours.
            </EmptyState>
          ) : schedulesLoading ? (
            <p>Loading schedule…</p>
          ) : schedules.length === 0 ? (
            <EmptyState title="No operating hours configured">
              Use “Edit hours” to set opening times for this centre.
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
          {selectedCentreId === null ? (
            <EmptyState title="Select a centre">
              Pick a centre above to view its generated slots.
            </EmptyState>
          ) : slotsLoading ? (
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

      <Modal open={editOpen} title="Set operating hours" onClose={() => setEditOpen(false)}>
        <form
          className="form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setSchedules.mutate();
          }}
        >
          <p className="hint">
            Set open/close times and slot duration for each day. Inactive days won&apos;t generate
            slots.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Opens</th>
                  <th>Closes</th>
                  <th>Slot (min)</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {daySchedules.map((d) => (
                  <tr key={d.day_of_week}>
                    <td>{DAYS[d.day_of_week]}</td>
                    <td>
                      <Field label="Open time" className="span-1">
                        <input
                          type="time"
                          required
                          value={d.open_time}
                          onChange={(e) => updateDay(d.day_of_week, 'open_time', e.target.value)}
                        />
                      </Field>
                    </td>
                    <td>
                      <Field label="Close time" className="span-1">
                        <input
                          type="time"
                          required
                          value={d.close_time}
                          onChange={(e) => updateDay(d.day_of_week, 'close_time', e.target.value)}
                        />
                      </Field>
                    </td>
                    <td>
                      <Field label="Duration" className="span-1">
                        <input
                          type="number"
                          required
                          min="5"
                          max="480"
                          step="5"
                          value={d.slot_duration_minutes}
                          onChange={(e) =>
                            updateDay(
                              d.day_of_week,
                              'slot_duration_minutes',
                              Number(e.target.value),
                            )
                          }
                        />
                      </Field>
                    </td>
                    <td>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={d.is_active}
                          onChange={(e) => updateDay(d.day_of_week, 'is_active', e.target.checked)}
                        />
                        {d.is_active ? 'Active' : 'Closed'}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ErrorNote error={setSchedules.error} />
          <div className="btn-row">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" busy={setSchedules.isPending}>
              Save hours
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
