/**
 * What a patient can say is wrong, and which provider specialties can see them for it (a clinic
 * matches if it lists ANY of them). General dentists can assess most problems, so 'dentistry' is
 * included unless a specialist is genuinely required. Lives on the server so the web app, a future
 * PWA and the search agree. Clinics list their specialties in providers.specialties.
 * TODO(clinical-governance): review this mapping with the clinical advisory group.
 */
export const PROBLEMS = [
  { key: 'toothache', label: 'Toothache or pain', specialties: ['dentistry'] },
  { key: 'checkup', label: 'Check-up and cleaning', specialties: ['dentistry'] },
  { key: 'broken_tooth', label: 'Broken or chipped tooth', specialties: ['dentistry'] },
  {
    key: 'gum_problems',
    label: 'Gum problems or bleeding gums',
    specialties: ['periodontics', 'dentistry'],
  },
  { key: 'root_canal', label: 'Root canal treatment', specialties: ['endodontics', 'dentistry'] },
  { key: 'extraction', label: 'Tooth extraction', specialties: ['oral_surgery', 'dentistry'] },
  { key: 'braces', label: 'Braces or crooked teeth', specialties: ['orthodontics'] },
  { key: 'other', label: 'Something else', specialties: ['dentistry'] },
] as const;

export type ProblemKey = (typeof PROBLEMS)[number]['key'];
export const PROBLEM_KEYS = PROBLEMS.map((p) => p.key) as [ProblemKey, ...ProblemKey[]];
export const problemByKey = (key: ProblemKey) => PROBLEMS.find((p) => p.key === key)!;
