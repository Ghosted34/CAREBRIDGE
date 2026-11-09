import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  callsTo,
  consentsFixture,
  mockApi,
  patientUser,
  POLICIES_FIXTURE,
  renderApp,
} from '../../test/utils';
import { NewRequestPage } from './NewRequestPage';

const render = () =>
  renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
const ALL_GRANTED = consentsFixture({ terms: true, privacy: true, data_sharing: true });
const base = (consents = ALL_GRANTED) => ({
  'GET /consents/policies': { body: { data: POLICIES_FIXTURE } },
  'GET /consents': { body: { data: consents } },
});

async function fillAndSend(answer: 'Yes' | 'No', text = 'Lower molar pain for three days') {
  await userEvent.click(screen.getByLabelText(answer));
  await userEvent.type(screen.getByLabelText('Describe the problem'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
}

describe('NewRequestPage', () => {
  it('requires the emergency question before sending', async () => {
    mockApi(base());
    render();
    await screen.findByLabelText('No');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText('No'));
    expect(await screen.findByRole('button', { name: 'Send request' })).toBeEnabled();
  });

  it('shows emergency guidance from the API instead of queueing the request', async () => {
    const fetchFn = mockApi({
      ...base(),
      'POST /requests': {
        status: 422,
        body: {
          error: {
            code: 'EMERGENCY_REDIRECT',
            message: 'Please call 112 now. CareBridge cannot handle emergencies.',
          },
        },
      },
    });
    render();
    await screen.findByLabelText('Yes');
    await fillAndSend('Yes', 'Face swelling fast since morning');
    expect(await screen.findByRole('heading', { name: /emergency help/i })).toBeInTheDocument();
    expect(screen.getByText(/CareBridge cannot handle emergencies/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112');
    expect(callsTo(fetchFn, 'POST /requests')[0]).toMatchObject({
      has_emergency_symptoms: true,
      specialty: 'dentistry',
    });
  });

  it('sends a routine request and opens it', async () => {
    mockApi({
      ...base(),
      'POST /requests': { status: 201, body: { data: { id: 42, status: 'submitted' } } },
    });
    render();
    await screen.findByLabelText('No');
    await fillAndSend('No');
    expect(await screen.findByText('request page')).toBeInTheDocument();
  });

  it('asks for data-sharing consent when missing and records it before sending', async () => {
    const fetchFn = mockApi({
      ...base(consentsFixture({ terms: true, privacy: true })),
      'POST /consents': { body: { data: { consents: ALL_GRANTED, withdrawn_requests: [] } } },
      'POST /requests': { status: 201, body: { data: { id: 7, status: 'submitted' } } },
    });
    render();
    expect(
      await screen.findByRole('heading', { name: 'Before we share your request' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('No'));
    await userEvent.type(
      screen.getByLabelText('Describe the problem'),
      'Lower molar pain for three days',
    );
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/I agree/));
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('request page')).toBeInTheDocument();
    expect(callsTo(fetchFn, 'POST /consents')).toEqual([
      { consent_type: 'data_sharing', granted: true, source: 'request_form' },
    ]);
    const order = fetchFn.mock.calls
      .map(([u, i]) => `${i?.method ?? 'GET'} ${u}`)
      .filter((k) => k.startsWith('POST'));
    expect(order).toEqual(['POST /api/v1/consents', 'POST /api/v1/requests']);
  });

  it('never records consent on the emergency path', async () => {
    const fetchFn = mockApi({
      ...base(consentsFixture({ terms: true, privacy: true })),
      'POST /requests': {
        status: 422,
        body: { error: { code: 'EMERGENCY_REDIRECT', message: 'Call 112.' } },
      },
    });
    render();
    await screen.findByLabelText('Yes');
    await fillAndSend('Yes');
    await screen.findByRole('heading', { name: /emergency help/i });
    expect(callsTo(fetchFn, 'POST /consents')).toEqual([]);
  });

  it('shows field errors returned by the API', async () => {
    mockApi({
      ...base(),
      'POST /requests': {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            details: { fieldErrors: { description: ['Too short'] } },
          },
        },
      },
    });
    render();
    await screen.findByLabelText('No');
    await fillAndSend('No', 'x');
    expect(await screen.findByText('Too short')).toBeInTheDocument();
  });
});
