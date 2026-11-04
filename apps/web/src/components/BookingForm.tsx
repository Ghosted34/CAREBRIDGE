import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api/endpoints';
import type { AppointmentType } from '../api/types';
import { appointmentType } from '../lib/labels';
import { addMinutes, defaultSlot, lagosLocalToIso, toLagosLocal } from '../lib/time';
import { Button, ErrorNote, Field } from './ui';

const DURATIONS = [30, 45, 60, 90, 120];

/** Book an appointment with the provider already assigned to a care request. Times are Lagos time. */
export function BookingForm({
  careRequestId,
  onBooked,
}: {
  careRequestId: number;
  onBooked?: () => void;
}) {
  const queryClient = useQueryClient();
  const [start, setStart] = useState(defaultSlot());
  const [duration, setDuration] = useState(45);
  const [type, setType] = useState<AppointmentType>('assessment');

  const book = useMutation({
    mutationFn: () => {
      const startsAt = lagosLocalToIso(start);
      return api.book({
        care_request_id: careRequestId,
        starts_at: startsAt,
        ends_at: addMinutes(startsAt, duration),
        appointment_type: type,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
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
        <Field label="Start (Lagos time)">
          <input
            type="datetime-local"
            required
            value={start}
            // Anchor min at midnight: browsers count `step` from `min`, so min=now would make
            // 09:00 an invalid value whenever now isn't on a 5-minute boundary. The API rejects past times.
            min={`${toLagosLocal(new Date()).slice(0, 10)}T00:00`}
            step={300}
            onChange={(e) => setStart(e.target.value)}
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
