/**
 * Current policy versions and plain-language summaries.
 *
 * Bumping a version means everyone must accept again before the actions that need it.
 * TODO(legal): the full policy texts must be written and reviewed (NDPA 2023) before launch;
 * these summaries are placeholders that describe intent, not legal wording.
 */
export const CONSENT_TYPES = ['terms', 'privacy', 'data_sharing', 'marketing'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export interface Policy {
  type: ConsentType;
  version: string;
  title: string;
  summary: string;
  /** Required for every account at registration. */
  requiredAtRegistration: boolean;
  /** Required (at the current version) before a patient can send a care request. */
  requiredForRequests: boolean;
}

export const POLICIES: Record<ConsentType, Policy> = {
  terms: {
    type: 'terms',
    version: '2026-11-01',
    title: 'Terms of use',
    summary:
      'CareLynk helps you find and coordinate care with verified providers. It is not an emergency service and does not give medical advice; clinical decisions are made by licensed professionals.',
    requiredAtRegistration: true,
    requiredForRequests: true,
  },
  privacy: {
    type: 'privacy',
    version: '2026-11-01',
    title: 'Privacy notice',
    summary:
      'We collect your contact details and what you tell us about your care needs to coordinate your care. We keep an audit trail of who accessed your information, and you can ask to see, correct or delete it.',
    requiredAtRegistration: true,
    requiredForRequests: true,
  },
  data_sharing: {
    type: 'data_sharing',
    version: '2026-11-01',
    title: 'Sharing your request with providers',
    summary:
      'When you send a care request, we share its details (service, urgency, area and your description) with verified providers that offer that service, so they can respond. Your name and phone number are shared only with the provider you choose.',
    requiredAtRegistration: false,
    requiredForRequests: true,
  },
  marketing: {
    type: 'marketing',
    version: '2026-11-01',
    title: 'Updates and offers',
    summary:
      'Occasional news about CareLynk services. Optional — you can turn this off at any time.',
    requiredAtRegistration: false,
    requiredForRequests: false,
  },
};

export const REQUIRED_FOR_REQUESTS = CONSENT_TYPES.filter((t) => POLICIES[t].requiredForRequests);
