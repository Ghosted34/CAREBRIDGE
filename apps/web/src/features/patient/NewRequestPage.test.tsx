import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { callsTo, consentsFixture, mockApi, patientUser, renderApp } from '../../test/utils';
import { NewRequestPage } from './NewRequestPage';

const POLICIES_FIXTURE = [
  {
    type: 'terms',
    version: 'v1',
    title: 'Terms of use',
    summary: 'Terms summary.',
    required_at_registration: true,
    required_for_requests: true,
  },
  {
    type: 'privacy',
    version: 'v1',
    title: 'Privacy notice',
    summary: 'Privacy summary.',
    required_at_registration: true,
    required_for_requests: true,
  },
  {
    type: 'data_sharing',
    version: 'v1',
    title: 'Sharing your request with providers',
    summary: 'We share your request with verified providers.',
    required_at_registration: false,
    required_for_requests: true,
  },
];

const ALL_GRANTED = consentsFixture({ terms: true, privacy: true, data_sharing: true });

const baseMatches = (careRequestId: number, providers = []) => ({
  'GET /consents/policies': { body: { data: POLICIES_FIXTURE } },
  'GET /consents': { body: { data: ALL_GRANTED } },
  [`GET /requests/${careRequestId}/matches`]: { body: { data: providers } },
});

async function fillAndSend(problem = 'Toothache / pain', date = '2026-11-15') {
  await userEvent.selectOptions(screen.getByLabelText("What's the problem?"), problem);
  await userEvent.clear(screen.getByLabelText('Preferred date'));
  await userEvent.type(screen.getByLabelText('Preferred date'), date);
  await userEvent.click(screen.getByRole('button', { name: 'Find clinics' }));
}

describe('NewRequestPage', () => {
  it('renders the simplified 2-input form', async () => {
    mockApi(baseMatches(42));
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    expect(await screen.findByLabelText("What's the problem?")).toBeInTheDocument();
    expect(screen.getByLabelText('Preferred date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find clinics' })).toBeDisabled();
  });

  it('enables Find clinics only after a date is chosen', async () => {
    mockApi(baseMatches(42));
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    expect(screen.getByRole('button', { name: 'Find clinics' })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Preferred date'));
    await userEvent.type(screen.getByLabelText('Preferred date'), '2026-11-15');
    expect(screen.getByRole('button', { name: 'Find clinics' })).toBeEnabled();
  });

  it('creates a request and transitions to clinic matching', async () => {
    const fetchFn = mockApi({
      ...baseMatches(42),
      'POST /requests': { status: 201, body: { data: { id: 42, status: 'submitted' } } },
    });
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    await fillAndSend();
    // BookingForm provider step renders a unique back button
    await screen.findByText('← Change problem or date');
    expect(callsTo(fetchFn, 'POST /requests')[0]).toMatchObject({
      specialty: 'dentistry',
      service_type: 'Toothache / pain',
      description: 'Toothache / pain',
      preferred_city: 'Lagos',
      urgency: 'routine',
      has_emergency_symptoms: false,
    });
  });

  it('shows the API error when request creation fails', async () => {
    mockApi({
      ...baseMatches(42),
      'POST /requests': {
        status: 400,
        body: {
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: {} },
        },
      },
    });
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    await fillAndSend();
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid request');
  });

  it('records missing data-sharing consent before sending the request', async () => {
    const consentOnly = consentsFixture({ terms: true, privacy: true });
    const fetchFn = mockApi({
      'GET /consents/policies': { body: { data: POLICIES_FIXTURE } },
      'GET /consents': { body: { data: consentOnly } },
      'POST /consents': { body: { data: { consents: ALL_GRANTED, withdrawn_requests: [] } } },
      'POST /requests': { status: 201, body: { data: { id: 7, status: 'submitted' } } },
      'GET /requests/7/matches': { body: { data: [] } },
    });
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    await fillAndSend();
    await screen.findByText('← Change problem or date');
    expect(callsTo(fetchFn, 'POST /consents')).toEqual([
      { consent_type: 'data_sharing', granted: true, source: 'request_form' },
    ]);
    const postOrder = fetchFn.mock.calls
      .map(([u, i]) => `${i?.method ?? 'GET'} ${u}`)
      .filter((k) => k.startsWith('POST'));
    expect(postOrder).toEqual(['POST /api/v1/consents', 'POST /api/v1/requests']);
  });

  it('submits normally when all consents are already granted', async () => {
    const fetchFn = mockApi({
      ...baseMatches(42),
      'POST /requests': { status: 201, body: { data: { id: 42, status: 'submitted' } } },
    });
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    await fillAndSend();
    await screen.findByText('← Change problem or date');
    expect(callsTo(fetchFn, 'POST /requests')[0]).toMatchObject({
      specialty: 'dentistry',
      service_type: 'Toothache / pain',
    });
  });
});
