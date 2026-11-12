import type { Appointment, CareRequest, SearchResult } from '../api/types';

export const DAY = 86_400_000;
export const isoIn = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

export const visitFixture = (over: Partial<CareRequest> = {}): CareRequest => ({
  id: 12,
  patient_user_id: 1,
  specialty: 'dentistry',
  service_type: 'Toothache or pain',
  description: 'Lower molar hurts when I drink cold water.',
  preferred_city: 'Ikeja',
  urgency: 'routine',
  status: 'provider_accepted',
  assigned_provider_id: 3,
  assigned_provider: 'Ikeja Dental',
  created_at: isoIn(-2 * DAY),
  updated_at: isoIn(-DAY),
  ...over,
});

export const appointmentFixture = (over: Partial<Appointment> = {}): Appointment => ({
  id: 30,
  care_request_id: 12,
  patient_user_id: 1,
  patient_name: 'Ada Patient',
  provider_id: 3,
  provider: 'Ikeja Dental',
  centre_id: 7,
  centre_name: 'Allen Avenue',
  centre_address: '24 Allen Avenue',
  caregiver_id: null,
  caregiver_name: null,
  appointment_type: 'assessment',
  appointment_mode: 'physical',
  starts_at: isoIn(DAY),
  ends_at: isoIn(DAY + 30 * 60_000),
  status: 'requested',
  created_at: isoIn(-DAY),
  ...over,
});

/** A free time 2 days out at 10:00 Lagos (09:00Z). */
export const freeTimeIso = () => {
  const d = new Date(Date.now() + 2 * DAY);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
};

export const resultFixture = (over: Partial<SearchResult> = {}): SearchResult => {
  const start = freeTimeIso();
  return {
    centre_id: 7,
    centre_name: 'Allen Avenue',
    address_line: '24 Allen Avenue',
    city: 'Ikeja',
    state: 'Lagos',
    phone: null,
    provider_id: 3,
    provider_name: 'Ikeja Dental',
    match: 'same_area',
    consultation_fee: { amount: 12000, currency: 'NGN' },
    caregivers: [{ id: 5, full_name: 'Dr Tunde Adeyemi', role: 'dentist' }],
    free_count: 1,
    free_times: [
      { starts_at: start, ends_at: new Date(Date.parse(start) + 1_800_000).toISOString() },
    ],
    ...over,
  };
};

export const listOf = <T>(data: T[]) => ({
  data,
  meta: { limit: 50, offset: 0, count: data.length },
});
