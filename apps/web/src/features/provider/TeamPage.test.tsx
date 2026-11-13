import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Me } from '../../api/types';
import { callsTo, membership, mockApi, renderApp, staffUser } from '../../test/utils';
import { TeamPage } from './TeamPage';

const owner = staffUser;
const clinician: Me = {
  ...staffUser,
  id: 11,
  full_name: 'Tunde Clinician',
  memberships: [membership(3, 'Ikeja Dental', 'clinician')],
};
const pendingClinic: Me = {
  ...staffUser,
  memberships: [{ ...membership(3, 'Ikeja Dental'), verification_status: 'pending' }],
};

const team = [
  {
    user_id: 9,
    full_name: 'Ngozi Owner',
    email: 'owner@clinic.test',
    status: 'active',
    provider_role: 'owner',
    created_at: '2026-11-01T10:00:00Z',
  },
  {
    user_id: 12,
    full_name: 'Bola Scheduler',
    email: 'bola@clinic.test',
    status: 'pending',
    provider_role: 'scheduler',
    created_at: '2026-11-02T10:00:00Z',
  },
];

const mock = (routes: Record<string, unknown> = {}) =>
  mockApi({
    'GET /providers/3/team': { body: { data: team } },
    'GET /staff-accounts': {
      body: {
        data: [{ id: 20, full_name: 'Amaka Dent', email: 'amaka@clinic.test', status: 'pending' }],
        meta: { limit: 50, offset: 0, count: 1 },
      },
    },
    'POST /providers/3/team': {
      body: { data: { provider_id: 3, user_id: 20, provider_role: 'clinician', activated: true } },
    },
    'DELETE /providers/3/team/12': { body: { data: { removed: true } } },
    ...routes,
  });

const render = (user: Me = owner) =>
  renderApp(<TeamPage />, { route: '/provider/team', auth: { user } });

describe('TeamPage', () => {
  it('lets the owner invite a staff account and remove a team member', async () => {
    const fetchFn = mock();
    render();
    expect(await screen.findByText('Bola Scheduler')).toBeInTheDocument();
    expect(screen.getByText('Awaiting first sign-in')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('name or email'), 'amaka@clinic.test');
    await userEvent.tab(); // the search runs when the field loses focus, not per keystroke
    expect(callsTo(fetchFn, 'GET /staff-accounts')).toHaveLength(1);
    await userEvent.selectOptions(await screen.findByLabelText('Staff account'), '20');
    await userEvent.selectOptions(screen.getByLabelText('Role in your clinic'), 'clinician');
    await userEvent.click(screen.getByRole('button', { name: 'Add to team' }));
    expect(callsTo(fetchFn, 'POST /providers/3/team')).toEqual([
      { user_id: 20, provider_role: 'clinician' },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(fetchFn.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toContain(
      'DELETE /api/v1/providers/3/team/12',
    );
  });

  it('does not offer to remove the owner, and shows no form to a clinician', async () => {
    mock();
    render(clinician);
    const list = (await screen.findByText('Bola Scheduler')).closest('section')!;
    expect(within(list).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Only the clinic owner can add or remove team members/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to team' })).not.toBeInTheDocument();
  });

  it('explains that team management waits for verification', async () => {
    mockApi({ 'GET /providers/3/team': { body: { data: team } } });
    render(pendingClinic);
    expect(
      await screen.findByText(/awaiting OnDiGoH verification\.\s*Team management unlocks/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to team' })).not.toBeInTheDocument();
  });

  it('shows the API refusal when an invite is rejected', async () => {
    mock({
      'POST /providers/3/team': {
        status: 409,
        body: {
          error: { code: 'ACCOUNT_SUSPENDED', message: 'This account is suspended' },
        },
      },
    });
    render();
    await userEvent.type(screen.getByPlaceholderText('name or email'), 'amaka');
    await userEvent.tab();
    await userEvent.selectOptions(await screen.findByLabelText('Staff account'), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Add to team' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This account is suspended');
  });
});
