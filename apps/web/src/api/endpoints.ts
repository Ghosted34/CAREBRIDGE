/** One function per API endpoint. Components call these through React Query, never fetch directly. */
import { qs, request } from './client';
import type {
  AdminProvider,
  AdminUser,
  AppNotification,
  AppointmentNote,
  BookingResult,
  FreeTime,
  NoteType,
  Problem,
  SearchPeriod,
  SearchResponse,
  TimeOfDay,
  Appointment,
  AppointmentMode,
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
  ReferralStatus,
  RequestStatus,
  ServiceEstimate,
  StaffAccount,
  StuckRequest,
  TeamRole,
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

  // search & booking
  problems: () => get<Envelope<Problem[]>>('/problems'),
  search: (body: { problem: string; periods: SearchPeriod[]; city?: string; state?: string }) =>
    post<Envelope<SearchResponse>>('/search', body),
  centreAvailability: (
    centreId: number,
    q: { from_date: string; to_date: string; time_of_day?: TimeOfDay },
  ) =>
    get<Envelope<{ centre_id: number; free_times: FreeTime[] }>>(
      `/centres/${centreId}/availability${qs(q)}`,
    ),
  /**
   * Book a free time. New visit: `problem` + the emergency answer. Follow-up on a visit:
   * `care_request_id` instead (clinic staff may book these for their patient).
   */
  book: (body: {
    centre_id: number;
    starts_at: string;
    appointment_mode?: AppointmentMode;
    caregiver_id?: number;
    problem?: string;
    details?: string;
    has_emergency_symptoms?: boolean;
    care_request_id?: number;
  }) => post<Envelope<BookingResult>>('/appointments', body),

  // visits (care requests are created by booking)
  myRequests: () => get<ListEnvelope<CareRequestSummary>>('/requests/mine'),
  request: (id: number) => get<Envelope<CareRequest>>(`/requests/${id}`),
  cancelRequest: (id: number) =>
    post<Envelope<{ id: number; status: RequestStatus }>>(`/requests/${id}/cancel`),

  // appointments
  myAppointments: (p: { provider_id?: number } = {}) =>
    get<ListEnvelope<Appointment>>(`/appointments/mine${qs(p)}`),
  appointmentAction: (id: number, verb: AppointmentVerb) =>
    post<Envelope<{ id: number }>>(`/appointments/${id}/${verb}`),
  appointmentNotes: (id: number) => get<ListEnvelope<AppointmentNote>>(`/appointments/${id}/notes`),
  addAppointmentNote: (id: number, body: { note_type: NoteType; summary: string }) =>
    post<Envelope<AppointmentNote>>(`/appointments/${id}/notes`, body),

  // opening hours (free times are computed from these)
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

  // operating centres (owner-managed)
  centres: (providerId: number, careRequestId?: number) =>
    get<Envelope<Centre[]>>(
      `/providers/${providerId}/centres${qs({ care_request_id: careRequestId })}`,
    ),
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
  ) => put<Envelope<Centre>>(`/providers/${providerId}/centres/${centreId}`, body),

  // caregivers (owner-managed)
  caregivers: (providerId: number, careRequestId?: number) =>
    get<Envelope<Caregiver[]>>(
      `/providers/${providerId}/caregivers${qs({ care_request_id: careRequestId })}`,
    ),
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
  setProviderFee: (
    providerId: number,
    body: {
      centre_id?: number | null;
      fee_type: ProviderFee['fee_type'];
      amount: number;
      currency?: string;
      is_active?: boolean;
    },
  ) => post<Envelope<ProviderFee>>(`/providers/${providerId}/fees`, body),
  updateProviderFee: (
    providerId: number,
    feeId: number,
    body: Partial<{
      centre_id: number | null;
      fee_type: ProviderFee['fee_type'];
      amount: number;
      currency: string;
      is_active: boolean;
    }>,
  ) => put<Envelope<ProviderFee>>(`/providers/${providerId}/fees/${feeId}`, body),
  deleteProviderFee: (providerId: number, feeId: number) =>
    request<Envelope<{ removed: boolean }>>('DELETE', `/providers/${providerId}/fees/${feeId}`),

  // patient KYC

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
    post<
      Envelope<{ id: number; verification_status: VerificationStatus; activated_owners: number[] }>
    >(`/admin/providers/${id}/verification`, { verification_status }),
  members: (providerId: number) =>
    get<Envelope<ProviderMember[]>>(`/admin/providers/${providerId}/members`),
  addMember: (providerId: number, user_id: number, provider_role: ProviderRole) =>
    post<Envelope<unknown>>(`/admin/providers/${providerId}/members`, { user_id, provider_role }),
  removeMember: (providerId: number, userId: number) =>
    request<Envelope<unknown>>('DELETE', `/admin/providers/${providerId}/members/${userId}`),
};

export type AppointmentVerb =
  'confirm' | 'decline' | 'check-in' | 'complete' | 'no-show' | 'cancel';
