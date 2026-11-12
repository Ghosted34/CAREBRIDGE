import type {
  AppointmentStatus,
  AppointmentType,
  AreaMatch,
  NoteType,
  SlaCategory,
  TimeOfDay,
  EstimateStatus,
  FeeType,
  PaymentStatus,
  ProviderRole,
  ReferralStatus,
  RequestStatus,
  Urgency,
  VerificationStatus,
} from '../api/types';

export type Tone = 'teal' | 'gold' | 'red' | 'grey' | 'green';

/**
 * A care request is a "visit": everything about one problem, from the first booking to the
 * closing note. Old journey stages (assessment → in treatment) still map to "Open".
 */
export const requestStatus: Record<RequestStatus, { label: string; tone: Tone; hint: string }> = {
  submitted: { label: 'New', tone: 'gold', hint: 'Waiting for the clinic' },
  matching: { label: 'New', tone: 'gold', hint: 'Waiting for the clinic' },
  provider_accepted: { label: 'Open', tone: 'teal', hint: 'Booked with a clinic' },
  assessment: { label: 'Open', tone: 'teal', hint: 'Under way with your clinic' },
  treatment_planned: { label: 'Open', tone: 'teal', hint: 'Under way with your clinic' },
  in_progress: { label: 'Open', tone: 'teal', hint: 'Under way with your clinic' },
  completed: { label: 'Closed', tone: 'green', hint: 'Your clinic closed this visit' },
  cancelled: { label: 'Cancelled', tone: 'grey', hint: 'This visit was cancelled' },
};

export const appointmentStatus: Record<
  AppointmentStatus,
  { label: string; tone: Tone; hint?: string }
> = {
  requested: {
    label: 'Awaiting clinic',
    tone: 'gold',
    hint: 'The clinic needs to confirm this booking',
  },
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

export const slaCategory: Record<SlaCategory, { label: string; tone: Tone; hint: string }> = {
  request_unconfirmed_breach: {
    label: 'Unconfirmed > 2h',
    tone: 'red',
    hint: 'Booking request still waiting for the clinic',
  },
  request_unconfirmed_warning: {
    label: 'Unconfirmed > 1h',
    tone: 'gold',
    hint: 'Booking request still waiting for the clinic',
  },
  visit_not_recorded: {
    label: 'Not checked in',
    tone: 'gold',
    hint: 'Appointment time passed; no check-in or no-show recorded',
  },
  notes_missing: {
    label: 'No notes > 24h',
    tone: 'gold',
    hint: 'Patient checked in but the visit has no outcome yet',
  },
};

export const noteType: Record<NoteType, { label: string; hint: string }> = {
  prescription: { label: 'Prescription', hint: 'Medicines given or prescribed' },
  referral: { label: 'Referral', hint: 'Sent for further diagnosis or a specialist' },
  follow_up: { label: 'Follow-up', hint: 'Another appointment is needed' },
  closing_consultancy: { label: 'Close visit', hint: 'Consultation finished; closes the visit' },
};

/** Who may write each note type (mirrors the API's NOTE_AUTHORS). */
export const noteAuthors: Record<NoteType, ProviderRole[]> = {
  prescription: ['owner', 'clinician'],
  referral: ['owner', 'clinician'],
  follow_up: ['owner', 'clinician', 'scheduler'],
  closing_consultancy: ['owner', 'clinician', 'scheduler'],
};

export const areaMatch: Record<AreaMatch, { label: string; tone: Tone }> = {
  same_area: { label: 'In your area', tone: 'green' },
  same_state: { label: 'Same state', tone: 'teal' },
  elsewhere: { label: 'Further away', tone: 'grey' },
};

export const timeOfDay: Record<TimeOfDay, string> = {
  any: 'Any time',
  morning: 'Morning (before 12)',
  afternoon: 'Afternoon (12–5pm)',
  evening: 'Evening (after 5pm)',
};

export const money = (amount: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    amount,
  );

export const feeType: Record<FeeType, string> = {
  consultancy: 'Consultation',
  treatment: 'Treatment',
  late_change: 'Late change',
  rescheduling: 'Rescheduling',
  no_show: 'No-show',
  other: 'Other',
};

export const titleCase = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
