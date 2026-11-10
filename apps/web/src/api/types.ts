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
export type AppointmentStatus =
  'requested' | 'booked' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentType =
  'assessment' | 'specialist' | 'diagnostic' | 'procedure' | 'follow_up';
export type AppointmentMode = 'physical' | 'remote';
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
  assigned_provider: string | null;
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
  /**
   * Appointments for this request where the patient was seen (`checked_in`/`completed`).
   * Clinical governance: estimates, referrals and treatment planning need at least one.
   */
  assessments_completed: number;
}

export interface Appointment {
  id: number;
  care_request_id: number;
  patient_user_id: number;
  patient_name: string;
  provider_id: number;
  provider: string;
  centre_id: number | null;
  appointment_type: AppointmentType;
  appointment_mode: AppointmentMode;
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

/** Roles a clinic owner can appoint themselves; `owner` is granted by CareBridge. */
export type TeamRole = 'clinician' | 'scheduler' | 'receptionist';

/** A provider-staff account a clinic owner may invite (contact details only). */
export interface StaffAccount {
  id: number;
  full_name: string;
  email: string;
  status: UserStatus;
}

/** Facility details submitted by a clinic registering itself. */
export interface ClinicRegistration {
  legal_name: string;
  display_name: string;
  provider_type: Provider['provider_type'];
  registration_number: string;
  cac_number: string;
  tax_id: string;
  city: string;
  address: string;
  specialties: string[];
  services?: string[];
}

export type ConsentType = 'terms' | 'privacy' | 'data_sharing' | 'marketing';

export interface Policy {
  type: ConsentType;
  version: string;
  title: string;
  summary: string;
  required_at_registration: boolean;
  required_for_requests: boolean;
}

export interface ConsentStatus {
  type: ConsentType;
  current_version: string;
  granted: boolean;
  granted_version: string | null;
  up_to_date: boolean;
  decided_at: string | null;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  /** Path in this app to open, e.g. /patient/requests/12 */
  link: string;
  read_at: string | null;
  created_at: string;
}

export type SlotStatus = 'available' | 'held' | 'booked' | 'cancelled';

export interface ProviderSchedule {
  id: number;
  provider_id: number;
  centre_id: number;
  day_of_week: number;
  open_time: string;
  close_time: string;
  slot_duration_minutes: number;
  is_active: number | boolean;
}

export interface ProviderSlot {
  id: number;
  provider_id: number;
  centre_id: number;
  start_time: string;
  end_time: string;
  status: SlotStatus;
  price: number | null;
  currency: string | null;
  appointment_id: number | null;
  created_at: string;
}

export type ReferralStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'completed' | 'cancelled';

export interface ClinicalReferral {
  id: number;
  care_request_id: number;
  referring_provider_id: number;
  referring_provider: string;
  receiving_provider_id: number;
  receiving_provider: string;
  referred_specialty: string;
  clinical_summary: string;
  status: ReferralStatus;
  created_at: string;
}

export type EstimateStatus = 'draft' | 'issued' | 'accepted' | 'rejected' | 'expired';

export interface ServiceEstimate {
  id: number;
  care_request_id: number;
  provider_id: number;
  provider: string;
  currency: string;
  amount: number | string;
  inclusions: string | null;
  exclusions: string | null;
  valid_until: string | null;
  status: EstimateStatus;
  created_at: string;
}

export type DocumentType = 'photo' | 'xray' | 'report' | 'referral' | 'other';

export interface ClinicalDocument {
  id: number;
  care_request_id: number;
  uploader_user_id: number;
  uploader_name: string;
  document_type: DocumentType;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  storage_key: string;
  download_url?: string;
  created_at: string;
}

export type PaymentStatus = 'initiated' | 'pending' | 'successful' | 'failed' | 'refunded';

export interface PaymentRecord {
  id: number;
  care_request_id: number;
  payer_user_id: number;
  payer_name: string;
  payee_provider_id: number | null;
  payee_provider: string | null;
  amount: number | string;
  currency: string;
  payment_provider: string | null;
  provider_reference: string | null;
  status: PaymentStatus;
  created_at: string;
}

export interface PaymentInitResult {
  payment_id: number;
  reference: string;
  authorization_url: string;
  access_code: string;
}

export interface MatchScore {
  total: number;
  tier: 'excellent' | 'good' | 'fair';
  breakdown: {
    clinical_fit: number;
    verification: number;
    location_fit: number;
    availability: number;
    performance: number;
  };
}

export interface MatchingProvider {
  provider_id: number;
  display_name: string;
  city: string;
  address: string;
  specialties: string[];
  score: MatchScore;
}

export interface StuckRequest {
  id: number;
  patient_user_id: number;
  patient_name: string;
  patient_email: string;
  category: string;
  urgency: Urgency;
  status: RequestStatus;
  city: string;
  assigned_provider_id: number | null;
  assigned_provider: string | null;
  created_at: string;
  updated_at: string;
  age_minutes: number;
  offers_count: number;
  appointments_count: number;
  sla_category:
    'unmatched_breach' | 'unmatched_warning' | 'unbooked_delay' | 'clinical_stalled' | 'standard';
}

export interface AuditLog {
  id: number;
  actor_user_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: number;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Centre {
  id: number;
  provider_id: number;
  name: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
}

export interface Caregiver {
  id: number;
  provider_id: number;
  centre_id: number;
  full_name: string;
  role: 'dentist' | 'caregiver' | 'hygienist' | 'specialist';
  is_active: boolean;
  centre_name: string;
}

export type FeeType =
  'consultancy' | 'treatment' | 'late_change' | 'rescheduling' | 'no_show' | 'other';

export interface ProviderFee {
  id: number;
  provider_id: number;
  centre_id: number | null;
  fee_type: FeeType;
  amount: number;
  currency: string;
  is_active: boolean;
}

export interface PatientKYC {
  address_street: string;
  address_city: string;
  address_state: string;
  address_postal: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  id_number: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
}

export interface ProviderKYC {
  cac_number: string;
  tax_id: string;
}
