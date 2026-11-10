export const ROLES = ['patient', 'provider_staff', 'operator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const PROVIDER_ROLES = ['owner', 'clinician', 'scheduler', 'receptionist'] as const;
export type ProviderRole = (typeof PROVIDER_ROLES)[number];

/**
 * Roles a clinic owner may appoint themselves. `owner` is excluded: CareBridge appoints owners
 * (at registration or from the admin console) so a clinic always has one accountable person.
 */
export const TEAM_ROLES = ['clinician', 'scheduler', 'receptionist'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** Roles that coordinate on behalf of CareBridge and are not tied to one provider. */
export const PLATFORM_STAFF: readonly Role[] = ['operator', 'admin'];

export interface AuthUser {
  id: number;
  role: Role;
  full_name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
