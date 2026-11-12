import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../../api/types';
import { resultFixture } from '../../test/fixtures';
import {
  callsTo,
  consentsFixture,
  mockApi,
  patientUser,
  POLICIES_FIXTURE,
  renderApp,
} from '../../test/utils';
import { BookPage } from './BookPage';

const PROBLEMS = [
  { key: 'toothache', label: 'Toothache or pain' },
  { key: 'braces', label: 'Braces' },
];

const mock = (results: SearchResult[], consented = true) =>
  mockApi({
    'GET /problems': { body: { data: PROBLEMS } },
    'POST /search': {
      body: {
        data: { near: { city: 'Ikeja', state: 'Lagos' }, problem: PROBLEMS[0], results },
      },
    },
    'GET /consents/policies': { body: { data: POLICIES_FIXTURE } },
    'GET /consents': {
      body: {
        data: consentsFixture(
          consented
            ? { terms: true, privacy: true, data_sharing: true }
            : { terms: true, privacy: true },
        ),
      },
    },
    'POST /consents': { body: { data: { consents: [], withdrawn_requests: [] } } },
    'POST /appointments': {
      status: 201,
      body: { data: { id: 40, care_request_id: 12, status: 'requested' } },
    },
  });

const render = (route = '/patient/new') =>
  renderApp(<BookPage />, { route, path: '/patient/new', auth: { user: patientUser } });

async function searchAndPick() {
  await userEvent.click(await screen.findByLabelText('Toothache or pain'));
  await userEvent.click(screen.getByRole('button', { name: 'Find clinics' }));
  expect(await screen.findByRole('heading', { name: 'Ikeja Dental' })).toBeInTheDocument();
  const [time] = screen.getAllByRole('button', { pressed: false, name: /\d\d:\d\d/ });
  await userEvent.click(time!);
}

describe('BookPage', () => {
  it('searches by problem and periods, then books the chosen time', async () => {
    const fetch = mock([resultFixture()]);
    render();
    await searchAndPick();

    const [search] = callsTo(fetch, 'POST /search');
    expect(search.problem).toBe('toothache');
    expect(search.periods).toHaveLength(1);
    expect(search.periods[0]).toMatchObject({ time_of_day: 'any' });
    expect(search.city).toBeUndefined();

    expect(screen.getByText('In your area')).toBeInTheDocument();
    expect(screen.getAllByText(/12,000/).length).toBeGreaterThan(0);

    const send = screen.getByRole('button', { name: 'Send booking request' });
    expect(send).toBeDisabled(); // emergency question unanswered
    await userEvent.click(screen.getByLabelText('No'));
    await userEvent.click(screen.getByLabelText('Video / voice call'));
    await userEvent.click(send);

    expect(await screen.findByText('request page')).toBeInTheDocument();
    const [body] = callsTo(fetch, 'POST /appointments');
    expect(body).toMatchObject({
      centre_id: 7,
      problem: 'toothache',
      appointment_mode: 'remote',
      has_emergency_symptoms: false,
    });
    expect(body.starts_at).toBe(resultFixture().free_times[0]!.starts_at);
  });

  it('sends emergencies to 112 instead of booking', async () => {
    const fetch = mock([resultFixture()]);
    render();
    await searchAndPick();
    await userEvent.click(screen.getByLabelText('Yes'));
    expect(screen.getByRole('alert')).toHaveTextContent('112');
    expect(screen.queryByRole('button', { name: 'Send booking request' })).not.toBeInTheDocument();
    expect(callsTo(fetch, 'POST /appointments')).toHaveLength(0);
  });

  it('asks for data-sharing consent explicitly and records it before booking', async () => {
    const fetch = mock([resultFixture()], false);
    render();
    await searchAndPick();
    await userEvent.click(screen.getByLabelText('No'));
    const send = screen.getByRole('button', { name: 'Send booking request' });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /I agree/ }));
    await userEvent.click(send);
    await screen.findByText('request page');
    expect(callsTo(fetch, 'POST /consents')).toEqual([
      { consent_type: 'data_sharing', granted: true, source: 'request_form' },
    ]);
  });

  it('can search near another area and add more periods', async () => {
    const fetch = mock([]);
    render();
    await userEvent.click(await screen.findByLabelText('Braces'));
    await userEvent.click(screen.getByRole('button', { name: 'Add another period' }));
    await userEvent.click(screen.getByLabelText(/Search near somewhere other/));
    await userEvent.type(screen.getByLabelText('Area or city'), 'Lekki');
    await userEvent.click(screen.getByRole('button', { name: 'Find clinics' }));
    expect(await screen.findByText('No free times found')).toBeInTheDocument();
    const [search] = callsTo(fetch, 'POST /search');
    expect(search.periods).toHaveLength(2);
    expect(search.periods[1].from_date > search.periods[0].to_date).toBe(true);

    expect(search.city).toBe('Lekki');
  });

  it('narrows to one clinic when coming from the directory', async () => {
    mock([
      resultFixture(),
      resultFixture({ centre_id: 8, provider_id: 4, provider_name: 'Lekki Smiles' }),
    ]);
    render('/patient/new?providerId=4');
    await userEvent.click(await screen.findByLabelText('Toothache or pain'));
    await userEvent.click(screen.getByRole('button', { name: 'Find clinics' }));
    expect(await screen.findByRole('heading', { name: 'Lekki Smiles' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ikeja Dental' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all clinics' }));
    expect(screen.getByRole('heading', { name: 'Ikeja Dental' })).toBeInTheDocument();
  });
});
