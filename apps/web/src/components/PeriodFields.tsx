import type { SearchPeriod, TimeOfDay } from '../api/types';
import { timeOfDay } from '../lib/labels';
import { addDays, lagosToday } from '../lib/time';
import { Field } from './ui';

/** One "I'm free…" period: from, to and part of day. */
export function PeriodFields({
  value,
  onChange,
  index,
}: {
  value: SearchPeriod;
  onChange: (p: SearchPeriod) => void;
  index?: number;
}) {
  const today = lagosToday();
  const suffix = index === undefined ? '' : ` (period ${index + 1})`;
  return (
    <>
      <Field label={`From${suffix}`}>
        <input
          type="date"
          required
          min={today}
          max={addDays(today, 60)}
          value={value.from_date}
          onChange={(e) => {
            const from = e.target.value;
            onChange({
              ...value,
              from_date: from,
              to_date: value.to_date < from ? from : value.to_date,
            });
          }}
        />
      </Field>
      <Field label={`To${suffix}`}>
        <input
          type="date"
          required
          min={value.from_date || today}
          max={addDays(today, 60)}
          value={value.to_date}
          onChange={(e) => onChange({ ...value, to_date: e.target.value })}
        />
      </Field>
      <Field label={`Time of day${suffix}`}>
        <select
          value={value.time_of_day}
          onChange={(e) => onChange({ ...value, time_of_day: e.target.value as TimeOfDay })}
        >
          {Object.entries(timeOfDay).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
