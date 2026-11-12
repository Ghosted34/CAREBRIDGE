import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Appointment, CareRequest } from '../../api/types';
import { appointmentFixture, DAY, isoIn, listOf, visitFixture } from '../../test/fixtures';
import { callsTo, mockApi, patientUser, renderApp } from '../../test/utils';
import { RequestDetailPage } from './RequestDetailPage';

const mock = (appointments: Appointment[], visit: CareRequest = visitFixture()) =>
  mockApi({
    'GET /requests/12': { body: { data: visit } },
    'GET /appointments/mine': { body: listOf(appointments) },
    'GET /appointments/29/notes': {
      body: listOf([
        {
          id: 1,
          appointment_id: 29,
          author_user_id: 9,
          author_name: 'Dr Tunde',
          note_type: 'prescription',
          summary: 'Amoxicillin 500mg three times a day for 5 days',
          created_at: isoIn(-DAY),
        },
      ]),
    },
    'POST /appointments/30/cancel': { body: { data: { id: 30, status: 'cancelled' } } },
  });

const render = (route = '/patient/requests/12') =>
  renderApp(<RequestDetailPage />, {
    route,
    path: '/patient/requests/:id',
    auth: { user: patientUser },
  });

describe('Visit page', () => {
  it('lists the visit’s appointments with where, how and status', async () => {
    mock([appointmentFixture({ appointment_mode: 'remote', caregiver_name: 'Dr Tunde' })]);
    render('/patient/requests/12?booked=1');
    expect(await screen.findByRole('heading', { name: 'Toothache or pain' })).toBeInTheDocument();
    expect(screen.getByText(/Booking request sent/)).toBeInTheDocument();
    expect(await screen.findByText('Awaiting clinic')).toBeInTheDocument();
    expect(screen.getByText('Video / voice call')).toBeInTheDocument();
    expect(screen.getByText('with Dr Tunde')).toBeInTheDocument();
    expect(screen.getByText('Lower molar hurts when I drink cold water.')).toBeInTheDocument();
  });

  it('shows the clinic’s notes once the patient was seen', async () => {
    mock([
      appointmentFixture({
        id: 29,
        status: 'completed',
        starts_at: isoIn(-2 * DAY),
        ends_at: isoIn(-2 * DAY + 1_800_000),
      }),
    ]);
    render();
    expect(await screen.findByText(/Amoxicillin 500mg/)).toBeInTheDocument();
    expect(screen.getByText('Prescription')).toBeInTheDocument();
  });

  it('lets the patient cancel a pending booking', async () => {
    const fetch = mock([appointmentFixture()]);
    render();
    const item = (await screen.findByText('Awaiting clinic')).closest('li')!;
    await userEvent.click(within(item).getByRole('button', { name: 'Cancel' }));
    expect(callsTo(fetch, 'POST /appointments/30/cancel')).toHaveLength(1);
  });

  it('offers no follow-up booking on a closed visit', async () => {
    mock(
      [
        appointmentFixture({
          id: 29,
          status: 'completed',
          starts_at: isoIn(-2 * DAY),
          ends_at: isoIn(-DAY),
        }),
      ],
      visitFixture({ status: 'completed' }),
    );
    render();
    expect(await screen.findByText('Closed')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Book another appointment/ }),
    ).not.toBeInTheDocument();
  });
});
