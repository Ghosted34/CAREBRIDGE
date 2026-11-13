import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/endpoints';
import type { AppointmentMode, FreeTime } from '../api/types';
import { formatDateTime } from '../lib/time';
import { newPeriod } from '../lib/periods';
import { PeriodFields } from './PeriodFields';
import { TimePicker } from './TimePicker';
import { Button, ErrorNote, Notice, Spinner } from './ui';

/**
 * Book another appointment on an open visit at the same centre (a follow-up). Used by the patient
 * on their visit page and by clinic staff after a consultation.
 */
export function FollowUpBooker({
  centreId,
  careRequestId,
  onBooked,
}: {
  centreId: number;
  careRequestId: number;
  onBooked?: () => void;
}) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(() => newPeriod());
  const [time, setTime] = useState<FreeTime | null>(null);
  const [mode, setMode] = useState<AppointmentMode>('physical');

  const free = useQuery({
    queryKey: ['availability', centreId, period],
    queryFn: () => api.centreAvailability(centreId, period),
    enabled: period.from_date !== '' && period.to_date >= period.from_date,
  });
  const book = useMutation({
    mutationFn: () =>
      api.book({
        centre_id: centreId,
        starts_at: time!.starts_at,
        appointment_mode: mode,
        care_request_id: careRequestId,
      }),
    onSuccess: () => {
      setTime(null);
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      onBooked?.();
    },
  });

  return (
    <div className="stack gap-3">
      <div className="form-grid form-grid-3">
        <PeriodFields
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setTime(null);
          }}
        />
      </div>
      {free.isPending ? (
        <Spinner label="Finding free times" />
      ) : free.isError ? (
        <ErrorNote error={free.error} />
      ) : free.data.data.free_times.length === 0 ? (
        <Notice tone="warn">No free times in those dates. Try other dates.</Notice>
      ) : (
        <TimePicker
          label="Free times for the follow-up"
          times={free.data.data.free_times.slice(0, 60)}
          selected={time?.starts_at}
          onSelect={setTime}
        />
      )}
      {time && (
        <div className="confirm-bar">
          <span>
            Follow-up on <strong>{formatDateTime(time.starts_at)}</strong>
          </span>
          <ModeChoice value={mode} onChange={setMode} name={`mode-${careRequestId}`} />
          <Button busy={book.isPending} onClick={() => book.mutate()}>
            Book follow-up
          </Button>
        </div>
      )}
      <ErrorNote error={book.error} />
      {book.isSuccess && <Notice tone="success">Follow-up booked.</Notice>}
    </div>
  );
}

/** In person or remote (video/voice). The call itself happens outside OnDiGoH. */
export function ModeChoice({
  value,
  onChange,
  name,
}: {
  value: AppointmentMode;
  onChange: (m: AppointmentMode) => void;
  name: string;
}) {
  return (
    <div className="choice-row" role="radiogroup" aria-label="How will you be seen?">
      {(
        [
          ['physical', 'In person'],
          ['remote', 'Video / voice call'],
        ] as const
      ).map(([m, label]) => (
        <label key={m} className="choice">
          <input type="radio" name={name} checked={value === m} onChange={() => onChange(m)} />
          {label}
        </label>
      ))}
    </div>
  );
}
