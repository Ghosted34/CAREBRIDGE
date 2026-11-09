import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Me } from '../../api/types';
import { ClinicSwitcher } from '../../components/ClinicSwitcher';
import { membership, mockApi, renderApp, staffUser } from '../../test/utils';
import { QueuePage } from './QueuePage';

const queueItem = (id: number, service_type: string) => ({
  id,
  specialty: 'dentistry',
  service_type,
  description: 'Persistent pain in a lower molar for three days.',
  preferred_city: 'Lagos',
  urgency: 'soon',
  status: 'submitted',
  created_at: '2026-11-09T10:00:00Z',
});

const list = (data: unknown[]) => ({
  body: { data, meta: { limit: 50, offset: 0, count: data.length } },
});

const twoClinics: Me = {
  ...staffUser,
  memberships: [membership(3, 'Ikeja Dental'), membership(4, 'VI Smiles')],
};

const render = () =>
  renderApp(
    <>
      <ClinicSwitcher />
      <QueuePage />
    </>,
    { route: '/provider', auth: { user: twoClinics } },
  );

describe('QueuePage and the clinic switcher', () => {
  it('scopes the queue to the selected clinic and refetches when it changes', async () => {
    const fetchFn = mockApi({
      'GET /requests/queue': [
        list([queueItem(1, 'Root canal assessment')]),
        list([queueItem(2, 'Cleaning and check-up')]),
      ],
      'GET /offers/mine': list([]),
    });
    render();
    expect(await screen.findByText(/Root canal assessment/)).toBeInTheDocument();
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/v1/requests/queue?provider_id=3');

    await userEvent.selectOptions(screen.getByLabelText('Active clinic'), '4');
    expect(await screen.findByText(/Cleaning and check-up/)).toBeInTheDocument();
    expect(screen.queryByText(/Root canal assessment/)).not.toBeInTheDocument();
    const urls = fetchFn.mock.calls.map(([url]) => String(url));
    expect(urls).toContain('/api/v1/requests/queue?provider_id=4');
    expect(urls).toContain('/api/v1/offers/mine?provider_id=4');
  });

  it('warns staff who are not linked to a verified clinic yet', async () => {
    mockApi({ 'GET /requests/queue': list([]), 'GET /offers/mine': list([]) });
    renderApp(<QueuePage />, {
      route: '/provider',
      auth: { user: { ...staffUser, memberships: [] } },
    });
    expect(await screen.findByText(/isn’t linked to a verified provider yet/)).toBeInTheDocument();
  });
});
