import { useSyncExternalStore } from 'react';
import type { Membership } from '../../api/types';
import { useAuth } from '../../auth/authContext';

/**
 * Which clinic a staff member is working as, shared by every component on screen. A tiny store
 * (rather than component state) because the switcher lives in the topbar while the queue,
 * appointments, offers and capacity live in the page: they all have to follow the same choice.
 * Persisted in sessionStorage so a refresh doesn't silently switch clinics.
 */
const STORAGE_KEY = 'carebridge.activeClinicId';

const readStored = (): number | null => {
  try {
    const id = Number(sessionStorage.getItem(STORAGE_KEY));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

let selected: number | null = readStored();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => selected;

/** Choose the active clinic (topbar switcher). */
export function selectClinic(providerId: number) {
  selected = providerId;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(providerId));
  } catch {
    // Private browsing without storage: the choice still holds for this session.
  }
  for (const listener of listeners) listener();
}

export interface ActiveClinic {
  /**
   * Clinic-scoped provider id to filter by. `undefined` for platform staff and for staff with no
   * verified clinic, meaning "don't filter" — the API already scopes lists to what they may see.
   */
  clinicId: number | undefined;
  /** Verified clinics this user belongs to (empty for patients and platform staff). */
  clinics: Membership[];
  /** True when there is more than one clinic to switch between. */
  canSwitch: boolean;
  setClinicId: (providerId: number) => void;
}

/** The clinic the signed-in user is acting for: their queue, appointments, offers and capacity. */
export function useActiveClinic(): ActiveClinic {
  const { user } = useAuth();
  const stored = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isStaff = user?.role === 'provider_staff';
  const clinics = isStaff
    ? (user?.memberships ?? []).filter((m) => m.verification_status === 'verified')
    : [];
  const clinic = clinics.find((m) => m.provider_id === stored) ?? clinics[0];

  // selectClinic is a module-level function, so its identity never changes.
  return {
    clinicId: clinic?.provider_id,
    clinics,
    canSwitch: clinics.length > 1,
    setClinicId: selectClinic,
  };
}
