/** One function per API endpoint. Components call these through React Query, never fetch directly. */
import { qs, request } from './client';
import type {
  AdminProvider,
  AdminUser,
  AppNotification,
  Appointment,
  AppointmentMode,
  AppointmentType,
  AssignedRequest,
  AuditLog,
  CareRequest,
  Caregiver,
  Centre,
  ClinicRegistration,
  CareRequestSummary,
  ClinicalDocument,
  ClinicalReferral,
  ConsentStatus,
  ConsentType,
  DocumentType,
  Envelope,
  ListEnvelope,
  LoginResult,
  MatchingProvider,
  Me,
  Metrics,
  PaymentInitResult,
  PaymentRecord,
  Policy,
  Provider,
  PatientKYC,
  ProviderFee,
  ProviderMember,
  ProviderRole,
  ProviderSchedule,
  ProviderSlot,
  QueueItem,
  ReferralStatus,
  RequestStatus,
  ServiceEstimate,
  SlotStatus,
  StaffAccount,
  StuckRequest,
  TeamRole,
  Urgency,
  UserStatus,
  VerificationStatus,
} from './types';

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {});

export const api = {
  // auth
  login: (email: string, password: string) =>
    post<Envelope<LoginResult>>('/auth/login', { email, password }),
  register: (body: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
    role: 'patient' | 'provider_staff';
    accept_terms: boolean;
    accept_privacy: boolean;
    marketing_opt_in: boolean;
    /** Patient KYC: structured address, DOB, gender, ID number, emergency contact. */
    kyc?: PatientKYC;
    /** Facility details when a clinic registers itself; the provider starts `pending`. */
    clinic?: ClinicRegistration & {
      cac_number: string;
      tax_id: string;
    };
  }) =>
    post<Envelope<{ id: number; role: string; status: UserStatus; provider_id?: number }>>(
      '/auth/register',
      body,
    ),
  me: () => get<Envelope<Me>>('/me'),

  // notifications (in-app inbox)
  notifications: (p: { unread?: boolean } = {}) =>
    get<ListEnvelope<AppNotification>>(
      `/notifications${qs({ unread: p.unread ? 'true' : undefined })}`,
    ),
  unreadCount: () => get<Envelope<{ count: number }>>('/notifications/unread-count'),
  markNotificationRead: (id: number) => post<Envelope<unknown>>(`/notifications/${id}/read`),
  markAllNotificationsRead: () => post<Envelope<{ updated: number }>>('/notifications/read-all'),

  // consents
  policies: () => get<Envelope<Policy[]>>('/consents/policies'),
  myConsents: () => get<Envelope<ConsentStatus[]>>('/consents'),
  decideConsent: (
    consent_type: ConsentType,
    granted: boolean,
    source: 'settings' | 'request_form' = 'settings',
  ) =>
    post<Envelope<{ consents: ConsentStatus[]; withdrawn_requests: number[] }>>('/consents', {
      consent_type,
      granted,
      source,
    }),

  // public directory
  providers: (p: { specialty?: string; city?: string } = {}) =>
    get<ListEnvelope<Provider>>(`/providers${qs(p)}`),
  provider: (id: number) => get<Envelope<Provider>>(`/providers/${id}`),

  // clinic team (owner-managed, once the facility is verified)
  team: (providerId: number) => get<Envelope<ProviderMember[]>>(`/providers/${providerId}/team`),
  addTeamMember: (providerId: number, user_id: number, provider_role: TeamRole) =>
    post<Envelope<{ provider_id: number; user_id: number; provider_role: TeamRole }>>(
      `/providers/${providerId}/team`,
      { user_id, provider_role },
    ),
  removeTeamMember: (providerId: number, userId: number) =>
    request<Envelope<{ removed: boolean }>>('DELETE', `/providers/${providerId}/team/${userId}`),
  staffAccounts: (q: string) => get<ListEnvelope<StaffAccount>>(`/staff-accounts${qs({ q })}`),

  // care requests
  createRequest: (body: {
    specialty: string;
    service_type: string;
    description: string;
    preferred_city: string;
    urgency: Urgency;
    has_emergency_symptoms: boolean;
    /** Set when the patient picked a clinic in the directory: routes the request straight to it. */
    target_provider_id?: number;
  }) => post<Envelope<{ id: number; status: RequestStatus }>>('/requests', body),
  myRequests: () => get<ListEnvelope<CareRequestSummary>>('/requests/mine'),
  request: (id: number) => get<Envelope<CareRequest>>(`/requests/${id}`),
  cancelRequest: (id: number) =>
    post<Envelope<{ id: number; status: RequestStatus }>>(`/requests/${id}/cancel`),
  queue: (p: { specialty?: string; provider_id?: number } = {}) =>
    get<ListEnvelope<QueueItem>>(`/requests/queue${qs(p)}`),
  assigned: (p: { status?: RequestStatus; provider_id?: number } = {}) =>
    get<ListEnvelope<AssignedRequest>>(`/requests/assigned${qs(p)}`),
  progressRequest: (id: number, step: JourneyStep) =>
    post<Envelope<{ id: number; status: RequestStatus }>>(`/requests/${id}/${step}`),

  // appointments
  book: (body: {
    care_request_id: number;
    provider_id: number;
    centre_id?: number;
    starts_at: string;
    ends_at: string;
    appointment_type: AppointmentType;
    appointment_mode?: AppointmentMode;
    slot_id?: number;
    caregiver_id?: number;
  }) => post<Envelope<{ id: number; provider_id: number; status: string }>>('/appointments', body),
  myAppointments: (p: { provider_id?: number } = {}) =>
    get<ListEnvelope<Appointment>>(`/appointments/mine${qs(p)}`),
  appointmentAction: (id: number, verb: AppointmentVerb) =>
    post<Envelope<{ id: number }>>(`/appointments/${id}/${verb}`),
  updateRequestProvider: (id: number, body: { provider_id: number; centre_id?: number }) =>
    post<Envelope<{ id: number; provider_id: number; status: string }>>(
      `/appointments/${id}/provider`,
      body,
    ),

  // capacity & slots
  providerSchedules: (providerId: number) =>
    get<Envelope<ProviderSchedule[]>>(`/providers/${providerId}/schedules`),
  providerSchedulesByCentre: (providerId: number, centreId: number) =>
    get<Envelope<ProviderSchedule[]>>(`/providers/${providerId}/centres/${centreId}/schedules`),
  setProviderSchedules: (
    providerId: number,
    centreId: number,
    schedules: Array<Omit<ProviderSchedule, 'id' | 'provider_id' | 'centre_id'>>,
  ) =>
    put<Envelope<ProviderSchedule[]>>(`/providers/${providerId}/schedules`, {
      centre_id: centreId,
      schedules,
    }),
  providerSlots: (
    providerId: number,
    query: { from?: string; to?: string; status?: SlotStatus } = {},
  ) => get<Envelope<ProviderSlot[]>>(`/providers/${providerId}/slots${qs(query)}`),
  createSlot: (
    providerId: number,
    body: { centre_id: number; start_time: string; end_time: string },
  ) => post<Envelope<ProviderSlot>>(`/providers/${providerId}/slots`, body),
  generateSlots: (
    providerId: number,
    centreId: number,
    body: { start_date: string; end_date: string },
  ) =>
    post<Envelope<{ created_count: number }>>(`/providers/${providerId}/slots/generate`, {
      centre_id: centreId,
      ...body,
    }),
  cancelSlot: (id: number) => post<Envelope<ProviderSlot>>(`/slots/${id}/cancel`),
  updateSlotPrice: (id: number, body: { price: number; currency: string }) =>
    post<Envelope<ProviderSlot>>(`/slots/${id}/price`, body),
  centreSlots: (
    centreId: number,
    query: { from?: string; to?: string; status?: SlotStatus } = {},
  ) => get<Envelope<ProviderSlot[]>>(`/centres/${centreId}/slots${qs(query)}`),

  // operating centres (owner-managed)
  centres: (providerId: number) => get<Envelope<Centre[]>>(`/providers/${providerId}/centres`),
  createCentre: (
    providerId: number,
    body: {
      name: string;
      address_line: string;
      city: string;
      state: string;
      postal_code: string;
      phone?: string;
    },
  ) => post<Envelope<Centre>>(`/providers/${providerId}/centres`, body),
  updateCentre: (
    providerId: number,
    centreId: number,
    body: Partial<{
      name: string;
      address_line: string;
      city: string;
      state: string;
      postal_code: string;
      phone: string | null;
      is_active: boolean;
    }>,
  ) => post<Envelope<Centre>>(`/providers/${providerId}/centres/${centreId}`, body),

  // caregivers (owner-managed)
  caregivers: (providerId: number) =>
    get<Envelope<Caregiver[]>>(`/providers/${providerId}/caregivers`),
  createCaregiver: (
    providerId: number,
    body: {
      centre_id: number;
      full_name: string;
      role: 'dentist' | 'caregiver' | 'hygienist' | 'specialist';
    },
  ) => post<Envelope<Caregiver>>(`/providers/${providerId}/caregivers`, body),

  // provider fees (customizable priced slots)
  providerFees: (providerId: number) =>
    get<Envelope<ProviderFee[]>>(`/providers/${providerId}/fees`),

  // patient KYC
  patientKYC: () => get<Envelope<PatientKYC>>('/patient/kyc'),
  updatePatientKYC: (body: PatientKYC) => post<Envelope<PatientKYC>>('/patient/kyc', body),

  // matching
  matchesForRequest: (requestId: number) =>
    get<Envelope<MatchingProvider[]>>(`/requests/${requestId}/matches`),

  // referrals
  createReferral: (
    requestId: number,
    body: { receiving_provider_id: number; referred_specialty: string; clinical_summary: string },
  ) => post<Envelope<ClinicalReferral>>(`/requests/${requestId}/referrals`, body),
  referralsForRequest: (requestId: number) =>
    get<Envelope<ClinicalReferral[]>>(`/requests/${requestId}/referrals`),
  myReferrals: (query: { type?: 'incoming' | 'outgoing' | 'all'; status?: ReferralStatus } = {}) =>
    get<Envelope<ClinicalReferral[]>>(`/referrals/mine${qs(query)}`),
  acceptReferral: (id: number) => post<Envelope<ClinicalReferral>>(`/referrals/${id}/accept`),
  declineReferral: (id: number) => post<Envelope<ClinicalReferral>>(`/referrals/${id}/decline`),
  completeReferral: (id: number) => post<Envelope<ClinicalReferral>>(`/referrals/${id}/complete`),

  // estimates
  createEstimate: (
    requestId: number,
    body: {
      amount: number;
      currency?: string;
      inclusions?: string;
      exclusions?: string;
      valid_until?: string;
    },
  ) => post<Envelope<ServiceEstimate>>(`/requests/${requestId}/estimates`, body),
  estimatesForRequest: (requestId: number) =>
    get<Envelope<ServiceEstimate[]>>(`/requests/${requestId}/estimates`),
  acceptEstimate: (id: number) => post<Envelope<ServiceEstimate>>(`/estimates/${id}/accept`),
  rejectEstimate: (id: number) => post<Envelope<ServiceEstimate>>(`/estimates/${id}/reject`),

  // documents (secure uploads)
  requestUploadUrl: (
    requestId: number,
    body: {
      document_type: DocumentType;
      file_name: string;
      mime_type: string;
      file_size_bytes: number;
    },
  ) =>
    post<
      Envelope<{
        storage_key: string;
        upload_url: string;
        method: string;
        headers: Record<string, string>;
        expires_in_seconds: number;
      }>
    >(`/requests/${requestId}/documents/upload-url`, body),
  confirmUpload: (
    requestId: number,
    body: {
      storage_key: string;
      document_type: DocumentType;
      file_name: string;
      mime_type: string;
      file_size_bytes: number;
    },
  ) => post<Envelope<ClinicalDocument>>(`/requests/${requestId}/documents`, body),
  documentsForRequest: (requestId: number) =>
    get<Envelope<ClinicalDocument[]>>(`/requests/${requestId}/documents`),

  // payments
  initializePayment: (
    requestId: number,
    body: { amount: number; currency?: string; callback_url?: string },
  ) => post<Envelope<PaymentInitResult>>(`/requests/${requestId}/payments/initialize`, body),
  paymentsForRequest: (requestId: number) =>
    get<Envelope<PaymentRecord[]>>(`/requests/${requestId}/payments`),
  simulatePaymentSuccess: (paymentId: number) =>
    post<Envelope<PaymentRecord>>(`/payments/${paymentId}/simulate-success`),

  // admin / operations
  stuckRequests: () => get<Envelope<StuckRequest[]>>('/admin/stuck-requests'),
  auditLogs: (
    p: { action?: string; entity_type?: string; entity_id?: number; actor_user_id?: number } = {},
  ) => get<ListEnvelope<AuditLog>>(`/admin/audit-logs${qs(p)}`),
  metrics: () => get<Envelope<Metrics>>('/admin/metrics'),
  users: (p: { status?: UserStatus; role?: string } = {}) =>
    get<ListEnvelope<AdminUser>>(`/admin/users${qs(p)}`),
  setUserStatus: (id: number, status: 'active' | 'suspended') =>
    post<Envelope<unknown>>(`/admin/users/${id}/status`, { status }),
  adminProviders: (p: { verification_status?: VerificationStatus } = {}) =>
    get<ListEnvelope<AdminProvider>>(`/admin/providers${qs(p)}`),
  createProvider: (body: {
    legal_name: string;
    display_name: string;
    provider_type: Provider['provider_type'];
    registration_number: string;
    city: string;
    address: string;
    specialties: string[];
  }) => post<Envelope<{ id: number }>>('/admin/providers', body),
  setVerification: (id: number, verification_status: 'verified' | 'rejected' | 'suspended') =>
    post<Envelope<unknown>>(`/admin/providers/${id}/verification`, { verification_status }),
  members: (providerId: number) =>
    get<Envelope<ProviderMember[]>>(`/admin/providers/${providerId}/members`),
  addMember: (providerId: number, user_id: number, provider_role: ProviderRole) =>
    post<Envelope<unknown>>(`/admin/providers/${providerId}/members`, { user_id, provider_role }),
  removeMember: (providerId: number, userId: number) =>
    request<Envelope<unknown>>('DELETE', `/admin/providers/${providerId}/members/${userId}`),
};

export type JourneyStep = 'start-assessment' | 'plan-treatment' | 'start-treatment' | 'complete';
export type AppointmentVerb =
  'confirm' | 'decline' | 'check-in' | 'complete' | 'no-show' | 'cancel';
