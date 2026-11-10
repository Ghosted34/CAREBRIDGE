import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api/endpoints';
import type { AppointmentMode, AppointmentType } from '../api/types';
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

const MODES: Array<{ value: AppointmentMode; label: string }> = [
  { value: 'physical', label: 'In person at the clinic' },
  { value: 'video_call', label: 'Video call' },
  { value: 'voice_call', label: 'Voice call' },
];

/**
 * Book an appointment with the provider already assigned to a care request.
 * Times are Lagos time; the visit happens at one of the provider's operating
 * centres, optionally with a specific caregiver, in person or remote.
 */
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
  const [centreId, setCentreId] = useState<string>('');
  const [selectedSlotId, setSelectedSlotId] = useState<number | undefined>();
  const [caregiverUserId, setCaregiverUserId] = useState<number | undefined>();
  const [start, setStart] = useState(defaultSlot());
  const [duration, setDuration] = useState(45);
  const [type, setType] = useState<AppointmentType>('assessment');
  const [mode, setMode] = useState<AppointmentMode>('physical');

  const { data: centresData } = useQuery({
    queryKey: ['centres', providerId],
    queryFn: () => (providerId ? api.providerCentres(providerId) : null),
    enabled: Boolean(providerId),
  });
  const centres = centresData?.data ?? [];

  const activeCentre = centres.find((c) => c.id === Number(centreId || ''));
  // With a single operating centre there is nothing to choose: book straight away.
  const resolvedCentreId =
    centreId || (centres.length === 1 ? String(centres[0]!.id) : '');

  const { data: slotsData } = useQuery({
    queryKey: ['slots', resolvedCentreId],
    queryFn: () =>
      Number(resolvedCentreId) > 0
        ? api.providerCentreSlots(Number(resolvedCentreId), { status: 'available' })
        : null,
    enabled: Number(resolvedCentreId) > 0,
  });

  const { data: caregiversData } = useQuery({
    queryKey: ['caregivers', resolvedCentreId],
    queryFn: () =>
      Number(resolvedCentreId) > 0
        ? api.centreCaregivers(Number(resolvedCentreId))
        : null,
    enabled: Number(resolvedCentreId) > 0,
  });
  const caregivers = caregiversData?.data ?? [];

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
      if (!resolvedCentreId) throw new Error('Choose an operating centre first');
      const startsAt = lagosLocalToIso(start);
      return api.book({
        care_request_id: careRequestId,
        starts_at: startsAt,
        ends_at: addMinutes(startsAt, duration),
        appointment_type: type,
        centre_id: Number(resolvedCentreId),
        caregiver_user_id: caregiverUserId,
        appointment_mode: mode,
        slot_id: selectedSlotId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
      void queryClient.invalidateQueries({ queryKey: ['centres'] });
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
        {centres.length > 1 && (
          <Field label="Operating centre">
            <select
              value={centreId}
              onChange={(e) => {
                setCentreId(e.target.value);
                setSelectedSlotId(undefined);
              }}
            >
              <option value="">-- Choose a centre --</option>
              {centres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.address})
                </option>
              ))}
            </select>
          </Field>
        )}
        {centres.length === 1 && (
          <Field label="Operating centre">
            <p className="muted small">
              {activeCentre?.name} — {activeCentre?.address}
            </p>
          </Field>
        )}
        {Number(resolvedCentreId) > 0 && (
          <>
            <Field label="Caregiver (optional)">
              <select
                value={caregiverUserId ? String(caregiverUserId) : ''}
                onChange={(e) =>
                  setCaregiverUserId(e.target.value ? Number(e.target.value) : undefined)
                }
              >
                <option value="">-- Let the clinic assign --</option>
                {caregivers.map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="How you&rsquo;ll be seen" className="span-2">
              <select value={mode} onChange={(e) => setMode(e.target.value as AppointmentMode)}>
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            {availableSlots.length > 0 && (
              <Field label="Choose available slot">
                <select
                  value={selectedSlotId ? String(selectedSlotId) : ''}
                  onChange={(e) => handleSlotSelect(e.target.value)}
                >
                  <option value="">-- Custom appointment time --</option>
                  {availableSlots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDateTime(s.start_time)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
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
        <Button type="submit" busy={book.isPending} disabled={!resolvedCentreId}>
          Book appointment
        </Button>
      </div>
    </form>
  );
}
