import { screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Appointment, CareRequest, Offer } from '../../api/types';
import { formatTimeRange } from '../../lib/time';
import { mockApi, patientUser, renderApp } from '../../test/utils';
import { RequestDetailPage } from './RequestDetailPage';

const day = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const request: CareRequest = {
  id: 12,
  patient_user_id: 1,
  specialty: 'dentistry',
  service_type: 'Root canal assessment',
  description: 'Persistent pain in a lower molar for three days.',
  preferred_city: 'Lagos',
  urgency: 'soon',
  status: 'provider_accepted',
  assigned_provider_id: 3,
  assigned_provider: 'Ikeja Dental',
  created_at: iso(-2 * day),
  updated_at: iso(-day),
};

const acceptedOffer: Offer = {
  id: 5,
  provider_id: 3,
  provider: 'Ikeja Dental',
  provider_address: '12 Awolowo Road, Ikeja',
  message: null,
  status: 'accepted',
  offered_at: iso(-day),
  responded_at: iso(-day),
};

const appointment = (over: Partial<Appointment>): Appointment => ({
  id: 30,
  care_request_id: 12,
  patient_user_id: 1,
  patient_name: 'Ada Patient',
  provider_id: 3,
  provider: 'Ikeja Dental',
  centre_id: 7,
  centre: 'Ikeja Dental Main Centre',
  caregiver_user_id: null,
  caregiver: null,
  appointment_type: 'assessment',
  appointment_mode: 'physical',
  starts_at: iso(day),
  ends_at: iso(day + 45 * 60_000),
  status: 'booked',
  created_at: iso(-day),
  ...over,
});

const mock = (appointments: Appointment[]) =>
  mockApi({
    'GET /requests/12': { body: { data: request } },
    'GET /requests/12/offers': { body: { data: [acceptedOffer] } },
    'GET /appointments/mine': {
      body: { data: appointments, meta: { limit: 50, offset: 0, count: appointments.length } },
    },
    'GET /requests/12/estimates': { body: { data: [] } },
    'GET /requests/12/documents': { body: { data: [] } },
    'GET /requests/12/payments': { body: { data: [] } },
    'GET /providers/3/centres': {
      body: {
        data: [
          {
            id: 7,
            provider_id: 3,
            name: 'Main Centre',
            address: '1 Awolowo Road',
            city: 'Lagos',
            phone: null,
            is_active: true,
            created_at: iso(-day),
            updated_at: iso(-day),
          },
        ],
      },
    },
    'GET /providers/3/centres/7/slots': { body: { data: [] } },
    'GET /providers/3/centres/7/caregivers': { body: { data: [] } },
  });

const render = () =>
  renderApp(<RequestDetailPage />, {
    route: '/patient/requests/12',
    path: '/patient/requests/:id',
    auth: { user: patientUser },
  });

describe('RequestDetailPage booking', () => {
  it('offers the booking form while no appointment is live', async () => {
    mock([]);
    render();
    expect(await screen.findByRole('heading', { name: 'Book an appointment' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Book appointment' })).toBeEnabled(),
    );
    expect(screen.queryByRole('heading', { name: 'Upcoming appointment' })).not.toBeInTheDocument();
  });

  it('shows the upcoming appointment instead of the booking form', async () => {
    const upcoming = appointment({ status: 'confirmed' });
    mock([upcoming]);
    render();
    const heading = await screen.findByRole('heading', { name: 'Upcoming appointment' });
    expect(screen.queryByRole('heading', { name: 'Book an appointment' })).not.toBeInTheDocument();
    // Scoped to the summary card: the Appointments list below repeats the same visit.
    const card = within(heading.closest('section')!);
    expect(
      card.getByText(formatTimeRange(upcoming.starts_at, upcoming.ends_at)),
    ).toBeInTheDocument();
    expect(card.getByText('Assessment')).toBeInTheDocument();
    expect(card.getByText('Confirmed')).toBeInTheDocument();
    expect(card.getByText(/book another visit once this one is over/i)).toBeInTheDocument();
  });

  it('lets the patient book again once the visit is over or cancelled', async () => {
    mock([
      appointment({ id: 29, status: 'completed', starts_at: iso(-2 * day), ends_at: iso(-day) }),
      appointment({ id: 31, status: 'cancelled', starts_at: iso(day), ends_at: iso(day + day) }),
    ]);
    render();
    expect(await screen.findByRole('heading', { name: 'Book an appointment' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Upcoming appointment' })).not.toBeInTheDocument();
  });

  it('still hides booking when the request is not bookable at all', async () => {
    mockApi({
      'GET /requests/12': { body: { data: { ...request, status: 'submitted' } } },
      'GET /requests/12/offers': { body: { data: [] } },
      'GET /appointments/mine': {
        body: { data: [], meta: { limit: 50, offset: 0, count: 0 } },
      },
      'GET /requests/12/estimates': { body: { data: [] } },
      'GET /requests/12/documents': { body: { data: [] } },
      'GET /requests/12/payments': { body: { data: [] } },
      'GET /requests/12/matches': { body: { data: [] } },
    });
    render();
    expect(await screen.findByRole('heading', { name: 'Provider offers' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Book an appointment' })).not.toBeInTheDocument();
  });
});
