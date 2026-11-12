import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { callsTo, mockApi, renderApp } from '../../test/utils';
import { RegisterPage } from './RegisterPage';

const render = (register: { status?: number; body: unknown }) => {
  const fetchFn = mockApi({ 'POST /auth/register': register });
  const login = vi.fn().mockResolvedValue({ id: 1, role: 'patient' });
  renderApp(<RegisterPage />, { route: '/register', auth: { login } });
  return { fetchFn, login };
};

const fillPerson = async () => {
  await userEvent.type(screen.getByLabelText('Full name'), 'Ngozi Owner');
  await userEvent.type(screen.getByLabelText('Email'), 'owner@clinic.test');
  await userEvent.type(screen.getByLabelText('Phone'), '+2348020000001');
  await userEvent.type(screen.getByLabelText('Password'), 'CareBridge!2026');
  await userEvent.click(screen.getByRole('checkbox', { name: /terms of use/i }));
  await userEvent.click(screen.getByRole('checkbox', { name: /privacy notice/i }));
};

describe('RegisterPage', () => {
  it('creates a patient account without any facility details', async () => {
    const { fetchFn, login } = render({
      status: 201,
      body: { data: { id: 1, role: 'patient', status: 'active' } },
    });
    await fillPerson();
    expect(screen.queryByRole('group', { name: 'Your facility' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await vi.waitFor(() => expect(login).toHaveBeenCalledOnce());
    const body = callsTo(fetchFn, 'POST /auth/register')[0];
    expect(body).toMatchObject({ role: 'patient', email: 'owner@clinic.test' });
    expect(body).not.toHaveProperty('clinic');
  });

  it('submits a clinic for verification and does not sign the owner in', async () => {
    const { fetchFn, login } = render({
      status: 201,
      body: { data: { id: 2, role: 'provider_staff', status: 'pending', provider_id: 7 } },
    });
    await userEvent.click(screen.getByRole('radio', { name: /Clinic \/ provider staff/i }));
    const facility = await screen.findByRole('group', { name: 'Your facility' });
    await fillPerson();
    await userEvent.type(within(facility).getByLabelText('Clinic name'), 'Lekki Smile Clinic');
    await userEvent.type(
      within(facility).getByLabelText('Registered (legal) name'),
      'Lekki Smile Clinic Ltd',
    );
    await userEvent.type(within(facility).getByLabelText(/Registration number/), 'MDCN/R/12345');
    await userEvent.type(within(facility).getByLabelText(/CAC number/), 'RC-123456');
    await userEvent.type(within(facility).getByLabelText(/Tax ID/), 'TIN-12345678-001');
    await userEvent.type(within(facility).getByLabelText('Address'), '4 Admiralty Way, Lekki');
    await userEvent.type(within(facility).getByLabelText('City'), 'Lagos');
    await userEvent.clear(within(facility).getByLabelText(/Specialties/));
    await userEvent.type(within(facility).getByLabelText(/Specialties/), 'Oral surgery, dentistry');

    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Submit for verification' }));

    expect(await screen.findByText(/awaiting verification/)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(callsTo(fetchFn, 'POST /auth/register')[0]).toEqual({
      full_name: 'Ngozi Owner',
      email: 'owner@clinic.test',
      phone: '+2348020000001',
      password: 'CareBridge!2026',
      role: 'provider_staff',
      accept_terms: true,
      accept_privacy: true,
      marketing_opt_in: false,
      clinic: {
        legal_name: 'Lekki Smile Clinic Ltd',
        display_name: 'Lekki Smile Clinic',
        provider_type: 'clinic',
        registration_number: 'MDCN/R/12345',
        cac_number: 'RC-123456',
        tax_id: 'TIN-12345678-001',
        city: 'Lagos',
        address: '4 Admiralty Way, Lekki',
        specialties: ['oral_surgery', 'dentistry'],
      },
    });
  });

  it('shows why a clinic registration was refused', async () => {
    const { login } = render({
      status: 409,
      body: {
        error: {
          code: 'ALREADY_REGISTERED',
          message: 'A facility with that registration number already exists',
        },
      },
    });
    await userEvent.click(screen.getByRole('radio', { name: /Clinic \/ provider staff/i }));
    await screen.findByRole('group', { name: 'Your facility' });
    await fillPerson();
    await userEvent.click(screen.getByRole('button', { name: 'Submit for verification' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A facility with that registration number already exists',
    );
    expect(login).not.toHaveBeenCalled();
  });

  it('keeps the password hidden behind a show/hide toggle', async () => {
    render({ status: 201, body: { data: { id: 1, role: 'patient', status: 'active' } } });
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
