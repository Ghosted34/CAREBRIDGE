import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp } from '../../test/utils';
import { ProvidersPage } from './ProvidersPage';

const provider = (id: number, display_name: string, accepting_referrals = true) => ({
  id,
  display_name,
  provider_type: 'clinic',
  city: 'Lagos',
  address: `${id} Awolowo Road, Ikeja`,
  specialties: ['dentistry'],
  services: null,
  accepting_referrals,
});

const render = (data: unknown[]) => {
  mockApi({
    'GET /providers': { body: { data, meta: { limit: 50, offset: 0, count: data.length } } },
  });
  return renderApp(<ProvidersPage />, { route: '/providers' });
};

describe('ProvidersPage', () => {
  it('lets a patient send a request straight to a listed clinic', async () => {
    render([provider(3, 'Ikeja Dental'), provider(4, 'Victoria Island Smiles')]);
    const cards = await screen.findAllByRole('heading', { level: 3 });
    expect(cards).toHaveLength(2);
    const link = within(cards[0]!.closest('.card')!).getByRole('link', {
      name: 'Book here',
    });
    expect(link).toHaveAttribute('href', '/patient/new?providerId=3');
  });

  it('shows an empty state when no clinic matches', async () => {
    render([]);
    expect(
      await screen.findByText('No verified providers for this specialty yet'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Book here' })).not.toBeInTheDocument();
  });
});
