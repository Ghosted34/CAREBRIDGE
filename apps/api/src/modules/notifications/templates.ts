/**
 * Notification templates. Rules (see docs/security.md):
 *  - NEVER include clinical text (descriptions, summaries) — SMS and email are not private channels.
 *  - SMS stays generic: no service names, just "request #12" and a prompt to open the app.
 *  - Payloads hold IDs, names of clinics, and times only.
 * Text is rendered when read/sent, so wording can be fixed without touching stored rows.
 */
const dateTime = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const when = (iso: unknown) => (typeof iso === 'string' ? dateTime.format(new Date(iso)) : '');

export type Channel = 'in_app' | 'sms' | 'email';

export interface Payload {
  request_id?: number;
  appointment_id?: number;
  provider?: string;
  starts_at?: string;
  step?: string;
  [key: string]: string | number | undefined;
}

interface Template {
  channels: Channel[];
  title: (p: Payload) => string;
  body: (p: Payload) => string;
  /** Short SMS text (≤ 160 chars). Required when channels include 'sms'. */
  sms?: (p: Payload) => string;
  /** Path in the web app this notification opens. */
  link: (p: Payload) => string;
}

const STEP_TEXT: Record<string, string> = {
  assessment: 'Your provider has started your assessment.',
  treatment_planned: 'Your provider has prepared a treatment plan.',
  in_progress: 'Your treatment has started.',
  completed: 'Your care journey is marked complete. We hope you feel better!',
};

export const TEMPLATES = {
  new_request: {
    channels: ['in_app'],
    title: () => 'New request in your queue',
    body: (p) => `Request #${p.request_id} matches ${p.provider}'s services.`,
    link: () => '/provider',
  },
  request_directed: {
    channels: ['in_app', 'email'],
    title: () => 'A patient chose your clinic',
    body: (p) =>
      `Request #${p.request_id} was sent to ${p.provider} directly. Book their first appointment.`,
    link: () => '/provider/patients',
  },
  request_cancelled: {
    channels: ['in_app'],
    title: () => 'Request cancelled',
    body: (p) => `Request #${p.request_id} was cancelled by the patient.`,
    link: () => '/provider/patients',
  },
  appointment_requested_provider: {
    channels: ['in_app', 'email'],
    title: () => 'New appointment request',
    body: (p) =>
      `A patient has requested an appointment on ${when(p.starts_at)} at ${p.provider} (request #${p.request_id}). Please confirm or decline.`,
    link: () => '/provider/appointments',
  },
  appointment_note_added: {
    channels: ['in_app'],
    title: () => 'New note on your visit',
    body: (p) => `Your provider has added a note to your appointment #${p.appointment_id}.`,
    link: () => '/patient/appointments',
  },
  appointment_declined_patient: {
    channels: ['in_app', 'sms'],
    title: () => 'Appointment request declined',
    body: (p) =>
      `${p.provider} was unable to accept your appointment request on ${when(p.starts_at)}. You can choose another time or provider.`,
    sms: (p) =>
      `CareLynk: ${p.provider} could not accept your appointment request on ${when(p.starts_at)}. Open the app to choose another time.`,
    link: (p) => `/patient/requests/${p.request_id}`,
  },
  appointment_booked_patient: {
    channels: ['in_app', 'sms'],
    title: () => 'Appointment booked',
    body: (p) => `${p.provider} booked you in for ${when(p.starts_at)} (Lagos time).`,
    sms: (p) =>
      `CareLynk: appointment booked with ${p.provider} on ${when(p.starts_at)}. Details in the app.`,
    link: (p) => `/patient/requests/${p.request_id}`,
  },
  appointment_booked_provider: {
    channels: ['in_app', 'email'],
    title: () => 'New appointment booked',
    body: (p) =>
      `A patient booked ${when(p.starts_at)} at ${p.provider} (request #${p.request_id}). Please confirm it.`,
    link: () => '/provider/appointments',
  },
  appointment_confirmed: {
    channels: ['in_app', 'sms'],
    title: () => 'Appointment confirmed',
    body: (p) => `${p.provider} confirmed your appointment on ${when(p.starts_at)}.`,
    sms: (p) => `CareLynk: ${p.provider} confirmed your appointment on ${when(p.starts_at)}.`,
    link: (p) => `/patient/requests/${p.request_id}`,
  },
  appointment_cancelled_patient: {
    channels: ['in_app', 'sms'],
    title: () => 'Appointment cancelled',
    body: (p) =>
      `${p.provider} cancelled your appointment on ${when(p.starts_at)}. You can book another time.`,
    sms: (p) =>
      `CareLynk: your appointment on ${when(p.starts_at)} was cancelled. Open the app to rebook.`,
    link: (p) => `/patient/requests/${p.request_id}`,
  },
  appointment_cancelled_provider: {
    channels: ['in_app', 'email'],
    title: () => 'Appointment cancelled',
    body: (p) =>
      `The patient cancelled their appointment on ${when(p.starts_at)} at ${p.provider}.`,
    link: () => '/provider/appointments',
  },
  request_progress: {
    channels: ['in_app'],
    title: () => 'Your care journey has moved on',
    body: (p) => STEP_TEXT[String(p.step)] ?? 'There is an update on your care request.',
    link: (p) => `/patient/requests/${p.request_id}`,
  },
  account_approved: {
    channels: ['in_app', 'email'],
    title: () => 'Your CareLynk account is approved',
    body: () =>
      'You can now sign in. If you are linked to a clinic, matching requests will appear in your queue.',
    link: () => '/provider',
  },
  team_invite: {
    channels: ['in_app', 'email'],
    title: () => 'You were added to a clinic team',
    body: (p) => `${p.provider} added you to their CareLynk team as ${p.role}.`,
    link: () => '/provider',
  },
  referral_received: {
    channels: ['in_app', 'email'],
    title: () => 'New clinical referral received',
    body: (p) =>
      `A clinician has referred request #${p.request_id} to ${p.provider} (${p.specialty ?? 'specialist'}).`,
    link: () => '/provider/referrals',
  },
  referral_accepted: {
    channels: ['in_app'],
    title: () => 'Referral accepted',
    body: (p) => `${p.provider} accepted the referral for request #${p.request_id}.`,
    link: () => '/provider/referrals',
  },
  referral_declined: {
    channels: ['in_app'],
    title: () => 'Referral declined',
    body: (p) => `${p.provider} was unable to accept the referral for request #${p.request_id}.`,
    link: () => '/provider/referrals',
  },
  estimate_issued: {
    channels: ['in_app', 'sms'],
    title: () => 'New cost estimate available',
    body: (p) =>
      `${p.provider} has provided a cost estimate of ${p.amount ?? ''} for request #${p.request_id}.`,
    sms: (p) =>
      `CareLynk: a cost estimate was issued for your request #${p.request_id}. Open the app to review.`,
    link: (p) => `/patient/requests/${p.request_id}`,
  },
  estimate_accepted: {
    channels: ['in_app'],
    title: () => 'Patient approved estimate',
    body: (p) => `The patient for request #${p.request_id} has approved your cost estimate.`,
    link: () => '/provider/patients',
  },
  estimate_rejected: {
    channels: ['in_app'],
    title: () => 'Patient declined estimate',
    body: (p) => `The patient for request #${p.request_id} declined your cost estimate.`,
    link: () => '/provider/patients',
  },
  payment_successful: {
    channels: ['in_app', 'sms'],
    title: () => 'Payment confirmed',
    body: (p) =>
      `Payment of ${p.amount ?? ''} for request #${p.request_id} was successfully processed.`,
    sms: (p) =>
      `CareLynk: payment of ${p.amount ?? ''} for request #${p.request_id} was confirmed.`,
    link: (p) => `/patient/requests/${p.request_id}`,
  },
  document_uploaded: {
    channels: ['in_app'],
    title: () => 'New document attached',
    body: (p) => `A new clinical document was uploaded for request #${p.request_id}.`,
    link: (p) => `/patient/requests/${p.request_id}`,
  },
} satisfies Record<string, Template>;

export type TemplateKey = keyof typeof TEMPLATES;

export function render(key: string, payload: Payload) {
  const t = (TEMPLATES as Record<string, Template>)[key];
  if (!t)
    return {
      title: 'Update',
      body: 'There is an update in CareLynk.',
      link: '/',
      sms: undefined,
    };
  return {
    title: t.title(payload),
    body: t.body(payload),
    link: t.link(payload),
    sms: t.sms?.(payload),
  };
}
