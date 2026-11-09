import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api/endpoints';
import type { AppointmentType } from '../api/types';
import { appointmentType } from '../lib/labels';
import {
  addMinutes,
  defaultSlot,
  formatDateTime,
  lagosLocalToIso,
  toLagosLocal,
} from '../lib/time';
import { Button, ErrorNote, Field } from './ui';

const DURATIONS = [30, 45, 60, 90, 120];

/** Book an appointment with the provider already assigned to a care request. Times are Lagos time. */
export function BookingForm({
  careRequestId,
  providerId,
  onBooked,
}: {
  careRequestId: number;
  providerId?: number;
  onBooked?: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedSlotId, setSelectedSlotId] = useState<number | undefined>();
  const [start, setStart] = useState(defaultSlot());
  const [duration, setDuration] = useState(45);
  const [type, setType] = useState<AppointmentType>('assessment');

  const { data: slotsData } = useQuery({
    queryKey: ['slots', providerId],
    queryFn: () => (providerId ? api.providerSlots(providerId, { status: 'available' }) : null),
    enabled: Boolean(providerId),
  });

  const availableSlots = slotsData?.data ?? [];

  const handleSlotSelect = (slotIdStr: string) => {
    if (!slotIdStr) {
      setSelectedSlotId(undefined);
      return;
    }
    const slotId = Number(slotIdStr);
    const found = availableSlots.find((s) => s.id === slotId);
    if (found) {
      setSelectedSlotId(slotId);
      setStart(toLagosLocal(found.start_time));
      const startMs = new Date(found.start_time).getTime();
      const endMs = new Date(found.end_time).getTime();
      const diffMin = Math.round((endMs - startMs) / 60_000);
      if (diffMin > 0) setDuration(diffMin);
    }
  };

  const book = useMutation({
    mutationFn: () => {
      const startsAt = lagosLocalToIso(start);
      return api.book({
        care_request_id: careRequestId,
        starts_at: startsAt,
        ends_at: addMinutes(startsAt, duration),
        appointment_type: type,
        slot_id: selectedSlotId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
      onBooked?.();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    book.mutate();
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        {availableSlots.length > 0 && (
          <Field label="Choose available clinic slot" className="span-2">
            <select
              value={selectedSlotId ? String(selectedSlotId) : ''}
              onChange={(e) => handleSlotSelect(e.target.value)}
            >
              <option value="">-- Custom appointment time --</option>
              {availableSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDateTime(s.start_time)} ({s.status})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Start (Lagos time)">
          <input
            type="datetime-local"
            required
            value={start}
            min={`${toLagosLocal(new Date()).slice(0, 10)}T00:00`}
            step={300}
            onChange={(e) => {
              setSelectedSlotId(undefined);
              setStart(e.target.value);
            }}
          />
        </Field>
        <Field label="Duration">
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} minutes
              </option>
            ))}
          </select>
        </Field>
        <Field label="Appointment type" className="span-2">
          <select value={type} onChange={(e) => setType(e.target.value as AppointmentType)}>
            {Object.entries(appointmentType).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorNote error={book.error} />
      <div className="btn-row">
        <Button type="submit" busy={book.isPending}>
          Book appointment
        </Button>
      </div>
    </form>
  );
}
