import type {
  AppointmentStatus,
  AppointmentType,
  OfferStatus,
  ProviderRole,
  RequestStatus,
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

export const offerStatus: Record<OfferStatus, { label: string; tone: Tone }> = {
  offered: { label: 'Awaiting patient', tone: 'gold' },
  accepted: { label: 'Accepted', tone: 'green' },
  declined: { label: 'Declined', tone: 'grey' },
  expired: { label: 'Expired', tone: 'grey' },
  withdrawn: { label: 'Withdrawn', tone: 'grey' },
};

export const appointmentStatus: Record<AppointmentStatus, { label: string; tone: Tone }> = {
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

export const titleCase = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
