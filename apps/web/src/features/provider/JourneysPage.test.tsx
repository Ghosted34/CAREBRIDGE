import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AssignedRequest } from '../../api/types';
import { mockApi, renderApp, staffUser } from '../../test/utils';
import { JourneysPage } from './JourneysPage';

const journey = (over: Partial<AssignedRequest>): AssignedRequest => ({
  id: 12,
  specialty: 'dentistry',
  service_type: 'Root canal assessment',
  description: 'Persistent pain in a lower molar for three days.',
  preferred_city: 'Lagos',
  urgency: 'soon',
  status: 'assessment',
  created_at: '2026-11-08T10:00:00Z',
  assigned_provider_id: 3,
  assigned_provider: 'Ikeja Dental',
  patient_name: 'Ada Patient',
  patient_phone: '+2348000000000',
  updated_at: '2026-11-09T10:00:00Z',
  assessments_completed: 0,
  ...over,
});

const render = (requests: AssignedRequest[]) => {
  const fetchFn = mockApi({
    'GET /requests/assigned': {
      body: { data: requests, meta: { limit: 50, offset: 0, count: requests.length } },
    },
    'GET /providers': { body: { data: [], meta: { limit: 50, offset: 0, count: 0 } } },
  });
  renderApp(<JourneysPage />, { route: '/provider/patients', auth: { user: staffUser } });
  return fetchFn;
};

const card = async () => {
  const heading = await screen.findByRole('heading', { name: /Ada Patient/ });
  return within(heading.closest('section')!);
};

describe('JourneysPage post-visit gating', () => {
  it('disables treatment planning, estimates and referrals until the patient has been seen', async () => {
    render([journey({})]);
    const c = await card();
    const blocked = ['Treatment planned', 'Issue estimate', 'Refer patient'];
    for (const label of blocked) {
      const btn = c.getByRole('button', { name: label });
      expect(btn).toBeDisabled();
      // The reason is on the wrapper as a title, so staff know why the step is greyed out.
      expect(btn.closest('span')?.getAttribute('title')).toMatch(/once the patient has been seen/i);
    }
    // Booking the visit itself, and closing a journey that needs no treatment, stay available.
    expect(c.getByRole('button', { name: 'Book appointment' })).toBeEnabled();
    expect(c.getByRole('button', { name: 'Complete (no treatment needed)' })).toBeEnabled();
  });

  it('unlocks them once an appointment has been completed', async () => {
    render([journey({ assessments_completed: 1 })]);
    const c = await card();
    expect(c.getByRole('button', { name: 'Treatment planned' })).toBeEnabled();
    expect(c.getByRole('button', { name: 'Issue estimate' })).toBeEnabled();
    expect(c.getByRole('button', { name: 'Refer patient' })).toBeEnabled();
  });

  it('keeps start-treatment gated on the visit too', async () => {
    render([journey({ status: 'treatment_planned', assessments_completed: 0 })]);
    expect((await card()).getByRole('button', { name: 'Start treatment' })).toBeDisabled();
  });

  it('opens the estimate form with a spinner-free amount field and refuses a too-small amount', async () => {
    render([journey({ assessments_completed: 1 })]);
    const c = await card();
    await userEvent.click(c.getByRole('button', { name: 'Issue estimate' }));
    const amount = await screen.findByLabelText('Amount (NGN)');
    expect(amount).toHaveValue('25,000');
    // Spinner-free money field: a text input with a numeric keypad on mobile.
    expect(amount).toHaveAttribute('type', 'text');
    expect(amount).toHaveAttribute('inputmode', 'numeric');
    const modal = within(amount.closest('.modal')!);
    expect(modal.getByRole('button', { name: 'Issue estimate', hidden: true })).toBeEnabled();
    await userEvent.clear(amount);
    await userEvent.type(amount, '500');
    expect(amount).toHaveValue('500');
    expect(modal.getByRole('button', { name: 'Issue estimate', hidden: true })).toBeDisabled();
  });
});
