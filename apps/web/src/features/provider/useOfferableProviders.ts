import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/authContext';

export interface OfferableProvider {
  id: number;
  name: string;
  specialties?: string[];
}

/**
 * Providers the signed-in user may make offers for:
 * staff → their verified memberships as owner/clinician/scheduler; operators/admins → any verified provider.
 */
export function useOfferableProviders() {
  const { user } = useAuth();
  const isOps = user?.role === 'operator' || user?.role === 'admin';
  const ops = useQuery({
    queryKey: ['admin', 'providers', 'verified'],
    queryFn: () => api.adminProviders({ verification_status: 'verified' }),
    enabled: isOps,
  });
  if (isOps) {
    return (ops.data?.data ?? []).map<OfferableProvider>((p) => ({
      id: p.id,
      name: p.display_name,
      specialties: p.specialties,
    }));
  }
  return (user?.memberships ?? [])
    .filter((m) => m.verification_status === 'verified' && m.provider_role !== 'receptionist')
    .map<OfferableProvider>((m) => ({ id: m.provider_id, name: m.display_name }));
}
