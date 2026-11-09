import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Me } from '../api/types';
import { selectClinic } from '../features/provider/activeClinic';
import { membership, renderApp, staffUser } from '../test/utils';
import { ClinicSwitcher } from './ClinicSwitcher';

const multiClinic: Me = {
  ...staffUser,
  memberships: [membership(3, 'Ikeja Dental'), membership(4, 'VI Smiles', 'clinician')],
};

describe('ClinicSwitcher', () => {
  it('is hidden for staff with a single clinic', async () => {
    renderApp(<ClinicSwitcher />, { auth: { user: staffUser } });
    expect(screen.queryByLabelText('Active clinic')).not.toBeInTheDocument();
  });

  it('is hidden for patients and platform staff', () => {
    const { unmount } = renderApp(<ClinicSwitcher />, { auth: { user: staffUser } });
    unmount();
    renderApp(<ClinicSwitcher />, {
      auth: { user: { ...multiClinic, role: 'operator', memberships: [] } },
    });
    expect(screen.queryByLabelText('Active clinic')).not.toBeInTheDocument();
  });

  it('lists the accredited clinics and remembers the choice', async () => {
    const { unmount } = renderApp(<ClinicSwitcher />, { auth: { user: multiClinic } });
    const select = screen.getByLabelText('Active clinic');
    expect(select).toHaveValue('3');
    expect(screen.getByRole('option', { name: 'VI Smiles' })).toBeInTheDocument();

    await userEvent.selectOptions(select, '4');
    expect(select).toHaveValue('4');
    expect(sessionStorage.getItem('carebridge.activeClinicId')).toBe('4');
    unmount();

    // A refresh must not silently switch the clinic back.
    renderApp(<ClinicSwitcher />, { auth: { user: multiClinic } });
    expect(screen.getByLabelText('Active clinic')).toHaveValue('4');
  });

  it('ignores a clinic the user does not belong to', () => {
    selectClinic(99); // e.g. left over from a colleague's session on a shared device
    renderApp(<ClinicSwitcher />, { auth: { user: multiClinic } });
    expect(screen.getByLabelText('Active clinic')).toHaveValue('3');
  });
});
