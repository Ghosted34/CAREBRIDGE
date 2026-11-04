/**
 * Response shapes of the CareBridge API (/api/v1). Hand-maintained: when an API response changes,
 * update the type here in the same PR (see docs/CONVENTIONS.md §Web).
 */
export type Role = 'patient' | 'provider_staff' | 'operator' | 'admin';
export type ProviderRole = 'owner' | 'clinician' | 'scheduler' | 'receptionist';
export type Urgency = 'routine' | 'soon' | 'urgent';
export type RequestStatus =
  | 'submitted'
  | 'matching'
  | 'provider_accepted'
  | 'assessment'
  | 'treatment_planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type OfferStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
export type AppointmentStatus =
  'booked' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentType =
  'assessment' | 'specialist' | 'diagnostic' | 'procedure' | 'follow_up';
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';
export type UserStatus = 'pending' | 'active' | 'suspended';

export interface ListMeta {
  limit: number;
  offset: number;
  count: number;
}
export interface Envelope<T> {
  data: T;
}
export interface ListEnvelope<T> {
  data: T[];
  meta: ListMeta;
}

export interface Membership {
  provider_id: number;
  display_name: string;
  verification_status: VerificationStatus;
  provider_role: ProviderRole;
}

export interface Me {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  memberships: Membership[];
}

export interface LoginResult {
  token: string;
  user: { id: number; full_name: string; email: string; role: Role };
}

export interface Provider {
  id: number;
  display_name: string;
  provider_type: 'clinic' | 'hospital' | 'specialist' | 'diagnostic_centre';
  city: string;
  address: string;
  specialties: string[];
  services: string[] | null;
  accepting_referrals: boolean;
}

export interface CareRequestSummary {
  id: number;
  specialty: string;
  service_type: string;
  preferred_city: string;
  urgency: Urgency;
  status: RequestStatus;
  assigned_provider_id: number | null;
  assigned_provider: string | null;
  created_at: string;
}

export interface CareRequest {
  id: number;
  patient_user_id: number;
  specialty: string;
  service_type: string;
  description: string;
  preferred_city: string;
  urgency: Urgency;
  status: RequestStatus;
  assigned_provider_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface QueueItem {
  id: number;
  specialty: string;
  service_type: string;
  description: string;
  preferred_city: string;
  urgency: Urgency;
  status: RequestStatus;
  created_at: string;
}

export interface AssignedRequest extends QueueItem {
  assigned_provider_id: number;
  assigned_provider: string;
  patient_name: string;
  patient_phone: string;
  updated_at: string;
}

export interface Offer {
  id: number;
  provider_id: number;
  provider: string;
  provider_address: string;
  message: string | null;
  status: OfferStatus;
  offered_at: string;
  responded_at: string | null;
}

export interface ProviderOffer {
  id: number;
  care_request_id: number;
  provider_id: number;
  provider: string;
  message: string | null;
  status: OfferStatus;
  offered_at: string;
  responded_at: string | null;
  specialty: string;
  service_type: string;
  urgency: Urgency;
  request_status: RequestStatus;
}

export interface Appointment {
  id: number;
  care_request_id: number;
  patient_user_id: number;
  patient_name: string;
  provider_id: number;
  provider: string;
  appointment_type: AppointmentType;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  created_at: string;
}

export interface Metrics {
  patients: number;
  pending_provider_staff: number;
  verified_providers: number;
  pending_providers: number;
  care_requests: number;
  open_care_requests: number;
  appointments: number;
}

export interface AdminUser {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
  created_at: string;
}

export interface AdminProvider {
  id: number;
  legal_name: string;
  display_name: string;
  provider_type: Provider['provider_type'];
  registration_number: string;
  verification_status: VerificationStatus;
  status: 'active' | 'inactive';
  city: string;
  address: string;
  specialties: string[];
  accepting_referrals: boolean;
  created_at: string;
  member_count: number;
}

export interface ProviderMember {
  user_id: number;
  full_name: string;
  email: string;
  status: UserStatus;
  provider_role: ProviderRole;
  created_at: string;
}
