import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockFetch, patientUser, renderApp } from '../../test/utils';
import { NewRequestPage } from './NewRequestPage';

const render = () =>
  renderApp(<NewRequestPage />, { route: '/patient/new', auth: { user: patientUser } });

describe('NewRequestPage', () => {
  it('requires the emergency question before sending', async () => {
    render();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText('No'));
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
  });

  it('shows emergency guidance from the API instead of queueing the request', async () => {
    const fetchFn = mockFetch({
      status: 422,
      body: {
        error: {
          code: 'EMERGENCY_REDIRECT',
          message: 'Please call 112 now. CareBridge cannot handle emergencies.',
        },
      },
    });
    render();
    await userEvent.click(screen.getByLabelText('Yes'));
    await userEvent.type(
      screen.getByLabelText('Describe the problem'),
      'Face swelling fast since morning',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('heading', { name: /emergency help/i })).toBeInTheDocument();
    expect(screen.getByText(/CareBridge cannot handle emergencies/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112');
    expect(JSON.parse(fetchFn.mock.calls[0]![1].body)).toMatchObject({
      has_emergency_symptoms: true,
      specialty: 'dentistry',
    });
  });

  it('sends a routine request and opens it', async () => {
    mockFetch({ status: 201, body: { data: { id: 42, status: 'submitted' } } });
    render();
    await userEvent.click(screen.getByLabelText('No'));
    await userEvent.type(
      screen.getByLabelText('Describe the problem'),
      'Lower molar pain for three days',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('request page')).toBeInTheDocument();
  });

  it('shows field errors returned by the API', async () => {
    mockFetch({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: { fieldErrors: { description: ['Too short'] } },
        },
      },
    });
    render();
    await userEvent.click(screen.getByLabelText('No'));
    await userEvent.type(screen.getByLabelText('Describe the problem'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Too short')).toBeInTheDocument();
  });
});
