/** One function per API endpoint. Components call these through React Query, never fetch directly. */
import { qs, request } from './client';
import type {
  AdminProvider,
  AppNotification,
  ConsentStatus,
  ConsentType,
  Policy,
  AdminUser,
  Appointment,
  AppointmentType,
  AssignedRequest,
  CareRequest,
  CareRequestSummary,
  Envelope,
  ListEnvelope,
  LoginResult,
  Me,
  Metrics,
  Offer,
  Provider,
  ProviderMember,
  ProviderOffer,
  ProviderRole,
  QueueItem,
  RequestStatus,
  Urgency,
  UserStatus,
  VerificationStatus,
} from './types';

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});

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
  }) => post<Envelope<{ id: number; role: string; status: UserStatus }>>('/auth/register', body),
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

  // care requests
  createRequest: (body: {
    specialty: string;
    service_type: string;
    description: string;
    preferred_city: string;
    urgency: Urgency;
    has_emergency_symptoms: boolean;
  }) => post<Envelope<{ id: number; status: RequestStatus }>>('/requests', body),
  myRequests: () => get<ListEnvelope<CareRequestSummary>>('/requests/mine'),
  request: (id: number) => get<Envelope<CareRequest>>(`/requests/${id}`),
  cancelRequest: (id: number) =>
    post<Envelope<{ id: number; status: RequestStatus }>>(`/requests/${id}/cancel`),
  queue: (p: { specialty?: string } = {}) =>
    get<ListEnvelope<QueueItem>>(`/requests/queue${qs(p)}`),
  assigned: (p: { status?: RequestStatus } = {}) =>
    get<ListEnvelope<AssignedRequest>>(`/requests/assigned${qs(p)}`),
  progressRequest: (id: number, step: JourneyStep) =>
    post<Envelope<{ id: number; status: RequestStatus }>>(`/requests/${id}/${step}`),

  // offers
  makeOffer: (requestId: number, body: { provider_id: number; message?: string }) =>
    post<Envelope<{ id: number }>>(`/requests/${requestId}/offers`, body),
  offersForRequest: (requestId: number) => get<Envelope<Offer[]>>(`/requests/${requestId}/offers`),
  acceptOffer: (id: number) => post<Envelope<{ id: number }>>(`/offers/${id}/accept`),
  declineOffer: (id: number) => post<Envelope<{ id: number }>>(`/offers/${id}/decline`),
  withdrawOffer: (id: number) => post<Envelope<{ id: number }>>(`/offers/${id}/withdraw`),
  myOffers: () => get<ListEnvelope<ProviderOffer>>('/offers/mine'),

  // appointments
  book: (body: {
    care_request_id: number;
    starts_at: string;
    ends_at: string;
    appointment_type: AppointmentType;
  }) => post<Envelope<{ id: number }>>('/appointments', body),
  myAppointments: () => get<ListEnvelope<Appointment>>('/appointments/mine'),
  appointmentAction: (id: number, verb: AppointmentVerb) =>
    post<Envelope<{ id: number }>>(`/appointments/${id}/${verb}`),

  // admin / operations
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
export type AppointmentVerb = 'confirm' | 'check-in' | 'complete' | 'no-show' | 'cancel';
