import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NotificationBell } from '../../components/NotificationBell';
import { callsTo, mockApi, patientUser, renderApp } from '../../test/utils';
import { NotificationsPage } from './NotificationsPage';

const items = [
  {
    id: 2,
    type: 'offer_received',
    title: 'A provider has responded',
    body: 'Lekki Smiles Dental has offered to see you for request #7. Review and choose.',
    link: '/patient/requests/7',
    read_at: null,
    created_at: '2026-11-09T10:00:00Z',
  },
  {
    id: 1,
    type: 'request_progress',
    title: 'Your care journey has moved on',
    body: 'Your provider has started your assessment.',
    link: '/patient/requests/3',
    read_at: '2026-11-08T10:00:00Z',
    created_at: '2026-11-08T09:00:00Z',
  },
];

describe('notifications', () => {
  it('bell shows the unread count for screen readers too', async () => {
    mockApi({ 'GET /notifications/unread-count': { body: { data: { count: 3 } } } });
    renderApp(<NotificationBell />, { auth: { user: patientUser } });
    expect(
      await screen.findByRole('link', { name: 'Notifications, 3 unread' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opening an unread notification marks it read and goes to its page', async () => {
    const fetchFn = mockApi({
      'GET /notifications': { body: { data: items, meta: { limit: 50, offset: 0, count: 2 } } },
      'POST /notifications/2/read': { body: { data: { id: 2, read: true } } },
    });
    renderApp(<NotificationsPage />, { route: '/notifications', auth: { user: patientUser } });
    await userEvent.click(await screen.findByRole('button', { name: /A provider has responded/ }));
    expect(await screen.findByText('request page')).toBeInTheDocument();
    expect(callsTo(fetchFn, 'POST /notifications/2/read')).toHaveLength(1);
  });

  it('mark all as read appears only when something is unread', async () => {
    const fetchFn = mockApi({
      'GET /notifications': { body: { data: items, meta: { limit: 50, offset: 0, count: 2 } } },
      'POST /notifications/read-all': { body: { data: { updated: 1 } } },
    });
    renderApp(<NotificationsPage />, { route: '/notifications', auth: { user: patientUser } });
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    expect(callsTo(fetchFn, 'POST /notifications/read-all')).toHaveLength(1);
  });

  it('shows an empty state', async () => {
    mockApi({
      'GET /notifications': { body: { data: [], meta: { limit: 50, offset: 0, count: 0 } } },
    });
    renderApp(<NotificationsPage />, { route: '/notifications', auth: { user: patientUser } });
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });
});
