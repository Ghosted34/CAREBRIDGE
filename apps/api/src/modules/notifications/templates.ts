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
  offer_received: {
    channels: ['in_app', 'sms'],
    title: () => 'A provider has responded',
    body: (p) =>
      `${p.provider} has offered to see you for request #${p.request_id}. Review and choose.`,
    sms: (p) =>
      `CareBridge: a verified provider has responded to your request #${p.request_id}. Open the app to review.`,
    link: (p) => `/patient/requests/${p.request_id}`,
  },
  offer_accepted: {
    channels: ['in_app', 'email'],
    title: () => 'A patient chose your offer',
    body: (p) =>
      `The patient for request #${p.request_id} chose ${p.provider}. Please book their first appointment.`,
    link: () => '/provider/patients',
  },
  offer_declined: {
    channels: ['in_app'],
    title: () => 'Offer declined',
    body: (p) => `The patient for request #${p.request_id} declined the offer from ${p.provider}.`,
    link: () => '/provider/offers',
  },
  new_request: {
    channels: ['in_app'],
    title: () => 'New request in your queue',
    body: (p) => `Request #${p.request_id} matches ${p.provider}'s services.`,
    link: () => '/provider',
  },
  request_cancelled: {
    channels: ['in_app'],
    title: () => 'Request cancelled',
    body: (p) => `Request #${p.request_id} was cancelled by the patient.`,
    link: () => '/provider/patients',
  },
  appointment_booked_patient: {
    channels: ['in_app', 'sms'],
    title: () => 'Appointment booked',
    body: (p) => `${p.provider} booked you in for ${when(p.starts_at)} (Lagos time).`,
    sms: (p) =>
      `CareBridge: appointment booked with ${p.provider} on ${when(p.starts_at)}. Details in the app.`,
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
    sms: (p) => `CareBridge: ${p.provider} confirmed your appointment on ${when(p.starts_at)}.`,
    link: (p) => `/patient/requests/${p.request_id}`,
  },
  appointment_cancelled_patient: {
    channels: ['in_app', 'sms'],
    title: () => 'Appointment cancelled',
    body: (p) =>
      `${p.provider} cancelled your appointment on ${when(p.starts_at)}. You can book another time.`,
    sms: (p) =>
      `CareBridge: your appointment on ${when(p.starts_at)} was cancelled. Open the app to rebook.`,
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
    title: () => 'Your CareBridge account is approved',
    body: () =>
      'You can now sign in. If you are linked to a clinic, matching requests will appear in your queue.',
    link: () => '/provider',
  },
} satisfies Record<string, Template>;

export type TemplateKey = keyof typeof TEMPLATES;

export function render(key: string, payload: Payload) {
  const t = (TEMPLATES as Record<string, Template>)[key];
  if (!t)
    return {
      title: 'Update',
      body: 'There is an update in CareBridge.',
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
