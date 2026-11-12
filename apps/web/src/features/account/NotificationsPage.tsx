import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../api/endpoints';
import type { AppNotification } from '../../api/types';
import { Button, Card, EmptyState, ErrorNote, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/time';

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.notifications() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: api.markAllNotificationsRead, onSuccess: refresh });
  const open = useMutation({
    mutationFn: async (n: AppNotification) => {
      if (!n.read_at) await api.markNotificationRead(n.id);
      return n;
    },
    onSuccess: (n) => {
      refresh();
      navigate(n.link);
    },
  });
  const unread = (q.data?.data ?? []).filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Updates about your bookings, appointments and visit notes."
        actions={
          unread > 0 && (
            <Button variant="ghost" busy={readAll.isPending} onClick={() => readAll.mutate()}>
              Mark all as read
            </Button>
          )
        }
      />
      <ErrorNote error={readAll.error ?? open.error} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="You're all caught up">New updates will appear here.</EmptyState>
      ) : (
        <Card>
          <ul className="list">
            {q.data.data.map((n) => (
              <li key={n.id}>
                <button
                  className={`notice-row${n.read_at ? '' : ' unread'}`}
                  onClick={() => open.mutate(n)}
                >
                  <span className="list-item-main">
                    <span className="list-item-title">
                      {!n.read_at && <span className="dot" aria-label="Unread" />}
                      {n.title}
                    </span>
                    <span className="small muted">{n.body}</span>
                  </span>
                  <span className="small muted nowrap">{formatDateTime(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
