import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Appointment } from '../../api/types';
import { appointmentFixture, listOf } from '../../test/fixtures';
import { callsTo, membership, mockApi, renderApp, staffUser } from '../../test/utils';
import { ProviderAppointmentsPage } from './ProviderAppointmentsPage';

const CENTRE = { id: 7, provider_id: 3, name: 'Allen Avenue', city: 'Ikeja', state: 'Lagos' };

const mock = (appointments: Appointment[], centres: unknown[] = [CENTRE]) =>
  mockApi({
    'GET /providers/3/centres': { body: { data: centres } },
    'GET /appointments/mine': { body: listOf(appointments) },
    'POST /appointments/30/confirm': { body: { data: { id: 30, status: 'confirmed' } } },
    'POST /appointments/32/check-in': { body: { data: { id: 32, status: 'checked_in' } } },
    'GET /appointments/32/notes': { body: listOf([]) },
    'GET /appointments/31/notes': { body: listOf([]) },
    'POST /appointments/31/notes': { body: { data: { id: 1 } } },
  });

const render = (role: 'owner' | 'scheduler' = 'owner') =>
  renderApp(<ProviderAppointmentsPage />, {
    auth: { user: { ...staffUser, memberships: [membership(3, 'Ikeja Dental', role)] } },
  });

describe('Clinic bookings', () => {
  it('opens on requests to confirm, and confirms one', async () => {
    const fetch = mock([
      appointmentFixture(),
      appointmentFixture({ id: 31, status: 'checked_in', patient_name: 'Bola' }),
    ]);
    render();
    expect(await screen.findByRole('button', { name: 'To confirm (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByText('Bola')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(callsTo(fetch, 'POST /appointments/30/confirm')).toHaveLength(1);
  });

  it('a dentist/owner can write any note type after check-in', async () => {
    const fetch = mock([appointmentFixture({ id: 31, status: 'checked_in' })]);
    render('owner');
    await userEvent.click(await screen.findByRole('button', { name: 'Notes' }));
    const form = await screen.findByRole('form', { name: /Add a note/ });
    await userEvent.click(within(form).getByLabelText('Prescription'));
    await userEvent.type(within(form).getByLabelText('Note for the patient'), 'Ibuprofen 400mg');
    await userEvent.click(within(form).getByRole('button', { name: 'Save note' }));
    expect(callsTo(fetch, 'POST /appointments/31/notes')).toEqual([
      { note_type: 'prescription', summary: 'Ibuprofen 400mg' },
    ]);
  });

  it('a scheduler cannot pick prescription or referral', async () => {
    mock([appointmentFixture({ id: 31, status: 'checked_in' })]);
    render('scheduler');
    await userEvent.click(await screen.findByRole('button', { name: 'Notes' }));
    const form = await screen.findByRole('form', { name: /Add a note/ });
    expect(within(form).queryByLabelText('Prescription')).not.toBeInTheDocument();
    expect(within(form).queryByLabelText('Referral')).not.toBeInTheDocument();
    expect(within(form).getByLabelText('Follow-up')).toBeInTheDocument();
    expect(within(form).getByLabelText('Close visit')).toBeInTheDocument();
  });

  it('after check-in, follows the patient to “Checked in” with the notes form open', async () => {
    const before = appointmentFixture({ id: 32, status: 'confirmed' });
    mockApi({
      'GET /appointments/mine': [
        { body: listOf([before]) },
        { body: listOf([{ ...before, status: 'checked_in' }]) },
      ],
      'POST /appointments/32/check-in': { body: { data: { id: 32, status: 'checked_in' } } },
      'GET /appointments/32/notes': { body: listOf([]) },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Check in' }));
    expect(await screen.findByRole('form', { name: /Add a note/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Checked in (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('tells a new clinic with no centre how patients will find it', async () => {
    mock([], []);
    render('owner');
    const link = await screen.findByRole('link', { name: /Add your first centre/ });
    expect(link).toHaveAttribute('href', '/provider/capacity');
  });

  it('no prompt once the clinic has a centre', async () => {
    mock([]);
    render('owner');
    await screen.findByRole('button', { name: /To confirm/ });
    expect(screen.queryByText(/no centre/)).not.toBeInTheDocument();
  });
});
