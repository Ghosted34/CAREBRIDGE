import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { callsTo, consentsFixture, mockApi, patientUser, renderApp } from '../../test/utils';
import type { Provider } from '../../api/types';
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

const directoryMatches = (providers: Provider[] = []) => ({
  'GET /consents/policies': { body: { data: POLICIES_FIXTURE } },
  'GET /consents': { body: { data: ALL_GRANTED } },
  'GET /providers': { body: { data: providers, meta: {} } },
});

async function fillAndSend(problem = 'Toothache / pain', date = '2026-11-15') {
  await userEvent.selectOptions(screen.getByLabelText("What's the problem?"), problem);
  await userEvent.clear(screen.getByLabelText('Preferred date'));
  await userEvent.type(screen.getByLabelText('Preferred date'), date);
  await userEvent.click(screen.getByRole('button', { name: 'Find clinics' }));
}

describe('NewRequestPage', () => {
  it('renders the simplified 2-input form', async () => {
    mockApi(directoryMatches());
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    expect(await screen.findByLabelText("What's the problem?")).toBeInTheDocument();
    expect(screen.getByLabelText('Preferred date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find clinics' })).toBeDisabled();
  });

  it('enables Find clinics only after a date is chosen', async () => {
    mockApi(directoryMatches());
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    expect(screen.getByRole('button', { name: 'Find clinics' })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Preferred date'));
    await userEvent.type(screen.getByLabelText('Preferred date'), '2026-11-15');
    expect(screen.getByRole('button', { name: 'Find clinics' })).toBeEnabled();
  });

  it('transitions to clinic matching without creating a request', async () => {
    const fetchFn = mockApi(directoryMatches([{ id: 7, display_name: 'Ikeja Dental', city: 'Lagos', address: '10 Allen Ave', provider_type: 'clinic', specialties: ['dentistry'], services: null, accepting_referrals: true }]));
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    await fillAndSend();
    // Transitions to provider step; no care request is created yet.
    await screen.findByText('← Change problem or date');
    expect(callsTo(fetchFn, 'POST /requests')).toEqual([]);
    expect(callsTo(fetchFn, 'GET /providers')).toHaveLength(1);
  });

  it('lists providers from the directory search', async () => {
    const fetchFn = mockApi(directoryMatches([
      { id: 7, display_name: 'Ikeja Dental', city: 'Lagos', address: '10 Allen Ave', provider_type: 'clinic', specialties: ['dentistry'], services: null, accepting_referrals: true },
      { id: 9, display_name: 'Lekja Smiles', city: 'Lagos', address: '2 Queen Drive', provider_type: 'clinic', specialties: ['dentistry', 'orthodontics'], services: null, accepting_referrals: true },
    ]));
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    await fillAndSend();
    await screen.findByText('← Change problem or date');
    expect(await screen.findByText('Ikeja Dental')).toBeInTheDocument();
    expect(await screen.findByText('Lekja Smiles')).toBeInTheDocument();
    expect(callsTo(fetchFn, 'GET /providers')).toHaveLength(1);
  });

  it('shows empty state when no providers match', async () => {
    mockApi(directoryMatches([]));
    renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });
    await fillAndSend();
    await screen.findByText('← Change problem or date');
    expect(await screen.findByText('No clinics available')).toBeInTheDocument();
  });
});
