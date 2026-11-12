import type { FreeTime } from '../api/types';
import { formatDay, formatTime, groupByLagosDay } from '../lib/time';

/** Free times grouped by Lagos day, as buttons. The chosen one is pressed. */
export function TimePicker({
  times,
  selected,
  onSelect,
  label,
}: {
  times: FreeTime[];
  selected?: string | null;
  onSelect: (t: FreeTime) => void;
  /** Accessible name for the group, e.g. the centre name. */
  label: string;
}) {
  return (
    <div className="time-days" role="group" aria-label={label}>
      {groupByLagosDay(times).map(([day, list]) => (
        <div key={day} className="time-day">
          <div className="time-day-label">{formatDay(list[0]!.starts_at)}</div>
          <div className="time-grid">
            {list.map((t) => (
              <button
                key={t.starts_at}
                type="button"
                className="time-chip"
                aria-pressed={selected === t.starts_at}
                aria-label={`${formatDay(t.starts_at)} ${formatTime(t.starts_at)}`}
                onClick={() => onSelect(t)}
              >
                {formatTime(t.starts_at)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
