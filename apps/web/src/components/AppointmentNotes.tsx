import { useQuery } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { noteType } from '../lib/labels';
import { formatDateTime } from '../lib/time';
import { ErrorNote, Spinner } from './ui';

/** Notes the clinic wrote after a consultation: prescriptions, referrals, follow-ups, closing. */
export function AppointmentNotes({ appointmentId }: { appointmentId: number }) {
  const q = useQuery({
    queryKey: ['appointments', appointmentId, 'notes'],
    queryFn: () => api.appointmentNotes(appointmentId),
  });
  if (q.isPending) return <Spinner label="Loading notes" />;
  if (q.isError) return <ErrorNote error={q.error} />;
  if (q.data.data.length === 0) return <p className="muted small">No notes yet.</p>;
  return (
    <ul className="notes">
      {q.data.data.map((n) => (
        <li key={n.id} className="note">
          <div className="note-head">
            <span className="badge">{noteType[n.note_type].label}</span>
            <span className="muted small">
              {n.author_name} · {formatDateTime(n.created_at)}
            </span>
          </div>
          <p className="note-body">{n.summary}</p>
        </li>
      ))}
    </ul>
  );
}
