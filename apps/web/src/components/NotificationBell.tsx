import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router';
import { api } from '../api/endpoints';

/** Header bell with the unread count. Polls every 30 s while the tab is open. */
export function NotificationBell() {
  const q = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: api.unreadCount,
    refetchInterval: 30_000,
  });
  const count = q.data?.data.count ?? 0;
  const label = count ? `Notifications, ${count} unread` : 'Notifications';
  return (
    <NavLink to="/notifications" className="bell" aria-label={label} title={label}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && <span className="bell-count">{count > 99 ? '99+' : count}</span>}
    </NavLink>
  );
}
