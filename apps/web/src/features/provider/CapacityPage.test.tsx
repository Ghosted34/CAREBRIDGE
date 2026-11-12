import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { callsTo, membership, mockApi, renderApp, staffUser } from '../../test/utils';
import { CapacityPage } from './CapacityPage';

const centre = {
  id: 7,
  provider_id: 3,
  name: 'Allen Avenue',
  address_line: '24 Allen Avenue',
  city: 'Ikeja',
  state: 'Lagos',
  postal_code: '100212',
  phone: null,
  latitude: null,
  longitude: null,
  is_active: true,
};
const hours = [1, 2, 3, 4, 5].map((d) => ({
  id: d,
  provider_id: 3,
  centre_id: 7,
  day_of_week: d,
  open_time: '09:00:00',
  close_time: '17:00:00',
  slot_duration_minutes: 30,
  is_active: 1,
}));

const mock = () =>
  mockApi({
    'GET /providers/3/centres': { body: { data: [centre] } },
    'GET /providers/3/centres/7/schedules': { body: { data: hours } },
    'GET /providers/3/caregivers': { body: { data: [] } },
    'PUT /providers/3/schedules': { body: { data: [] } },
    'PUT /providers/3/centres/7': { body: { data: { ...centre, city: 'Ikeja GRA' } } },
  });

const render = (role: 'owner' | 'clinician' = 'owner') =>
  renderApp(<CapacityPage />, {
    auth: { user: { ...staffUser, memberships: [membership(3, 'Ikeja Dental', role)] } },
  });

describe('Centres & hours', () => {
  it('shows saved hours with closed days unticked, and saves only open days', async () => {
    const fetch = mock();
    render();
    const sunday = await screen.findByRole('checkbox', { name: 'Open on Sunday' });
    expect(sunday).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Open on Monday' })).toBeChecked();
    expect(screen.getByLabelText('Monday opens')).toHaveValue('09:00');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Open on Saturday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save hours' }));
    const [body] = callsTo(fetch, 'PUT /providers/3/schedules');
    expect(body.centre_id).toBe(7);
    expect(body.schedules.map((s: { day_of_week: number }) => s.day_of_week)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('only the owner can change hours', async () => {
    mock();
    render('clinician');
    expect(await screen.findByRole('checkbox', { name: 'Open on Monday' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save hours' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add centre' })).not.toBeInTheDocument();
  });

  it('the owner edits a centre: area, phone and whether it takes bookings', async () => {
    const fetch = mock();
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit centre' }));
    const form = screen.getByRole('form', { name: 'Edit centre' });
    const area = within(form).getByLabelText('Area / city');
    expect(area).toHaveValue('Ikeja');
    await userEvent.clear(area);
    await userEvent.type(area, 'Ikeja GRA');
    await userEvent.type(within(form).getByLabelText('Phone (optional)'), '+2348000000031');
    await userEvent.click(within(form).getByRole('checkbox', { name: /Taking bookings/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(callsTo(fetch, 'PUT /providers/3/centres/7')).toHaveLength(1));
    expect(callsTo(fetch, 'PUT /providers/3/centres/7')).toEqual([
      {
        name: 'Allen Avenue',
        address_line: '24 Allen Avenue',
        city: 'Ikeja GRA',
        state: 'Lagos',
        postal_code: '100212',
        phone: '+2348000000031',
        is_active: false,
      },
    ]);
    expect(await screen.findByRole('button', { name: 'Edit centre' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Edit centre' })).not.toBeInTheDocument();
  });

  it('other staff cannot edit a centre', async () => {
    mock();
    render('clinician');
    await screen.findByRole('checkbox', { name: 'Open on Monday' });
    expect(screen.queryByRole('button', { name: 'Edit centre' })).not.toBeInTheDocument();
  });
});
