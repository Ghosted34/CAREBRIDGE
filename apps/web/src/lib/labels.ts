import type {
  AppointmentStatus,
  AppointmentType,
  EstimateStatus,
  PaymentStatus,
  ProviderRole,
  ReferralStatus,
  RequestStatus,
  SlotStatus,
  Urgency,
  VerificationStatus,
} from '../api/types';

export type Tone = 'teal' | 'gold' | 'red' | 'grey' | 'green';

export const requestStatus: Record<RequestStatus, { label: string; tone: Tone; hint: string }> = {
  submitted: { label: 'Submitted', tone: 'gold', hint: 'Waiting for providers to respond' },
  matching: {
    label: 'Offers in',
    tone: 'gold',
    hint: 'Providers have responded — review their offers',
  },
  provider_accepted: {
    label: 'Provider confirmed',
    tone: 'teal',
    hint: 'Book your first appointment',
  },
  assessment: { label: 'Assessment', tone: 'teal', hint: 'Your provider is assessing your needs' },
  treatment_planned: {
    label: 'Treatment planned',
    tone: 'teal',
    hint: 'A treatment plan is ready',
  },
  in_progress: { label: 'In treatment', tone: 'teal', hint: 'Treatment is under way' },
  completed: { label: 'Completed', tone: 'green', hint: 'This care journey is complete' },
  cancelled: { label: 'Cancelled', tone: 'grey', hint: 'This request was cancelled' },
};

export const appointmentStatus: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Requested', tone: 'gold' },
  booked: { label: 'Booked', tone: 'gold' },
  confirmed: { label: 'Confirmed', tone: 'teal' },
  checked_in: { label: 'Checked in', tone: 'teal' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
  no_show: { label: 'No-show', tone: 'red' },
};

export const verificationStatus: Record<VerificationStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending review', tone: 'gold' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  suspended: { label: 'Suspended', tone: 'red' },
};

export const urgency: Record<Urgency, { label: string; tone: Tone }> = {
  routine: { label: 'Routine', tone: 'grey' },
  soon: { label: 'Soon', tone: 'gold' },
  urgent: { label: 'Urgent', tone: 'red' },
};

export const appointmentType: Record<AppointmentType, string> = {
  assessment: 'Assessment',
  specialist: 'Specialist consultation',
  diagnostic: 'Diagnostic',
  procedure: 'Procedure',
  follow_up: 'Follow-up',
};

export const providerRole: Record<ProviderRole, string> = {
  owner: 'Owner',
  clinician: 'Clinician',
  scheduler: 'Scheduler',
  receptionist: 'Receptionist',
};

export const referralStatus: Record<ReferralStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  sent: { label: 'Sent', tone: 'gold' },
  accepted: { label: 'Accepted', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
  completed: { label: 'Completed', tone: 'teal' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const estimateStatus: Record<EstimateStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  issued: { label: 'Pending Review', tone: 'gold' },
  accepted: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Declined', tone: 'red' },
  expired: { label: 'Expired', tone: 'grey' },
};

export const paymentStatus: Record<PaymentStatus, { label: string; tone: Tone }> = {
  initiated: { label: 'Initiated', tone: 'grey' },
  pending: { label: 'Pending', tone: 'gold' },
  successful: { label: 'Paid', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  refunded: { label: 'Refunded', tone: 'grey' },
};

export const slotStatus: Record<SlotStatus, { label: string; tone: Tone }> = {
  available: { label: 'Available', tone: 'green' },
  held: { label: 'Reserved', tone: 'gold' },
  booked: { label: 'Booked', tone: 'teal' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const slaCategory: Record<
  'unmatched_breach' | 'unmatched_warning' | 'unbooked_delay' | 'clinical_stalled' | 'standard',
  { label: string; tone: Tone }
> = {
  unmatched_breach: { label: 'SLA Breached (>2h)', tone: 'red' },
  unmatched_warning: { label: 'SLA Warning (>1h)', tone: 'gold' },
  unbooked_delay: { label: 'Unbooked (>24h)', tone: 'red' },
  clinical_stalled: { label: 'Stalled (>7d)', tone: 'gold' },
  standard: { label: 'On Track', tone: 'green' },
};

export const titleCase = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
