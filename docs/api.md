# API reference (v1)

Base URL: `/api/v1` (behind nginx in Docker: `http://localhost:3000/api/v1`; direct: `http://localhost:4000/api/v1`).
Health check: `GET /health` → `{ "status": "ok", "service": "CareBridge API" }`.

## Conventions

- **Auth:** `Authorization: Bearer <token>` from `POST /auth/login`. Tokens expire after `JWT_EXPIRES_IN` (default 8h).
- **Bodies:** JSON, `snake_case`. Max 100 kB.
- **Times:** ISO-8601 with an offset, e.g. `2026-11-10T09:00:00+01:00`. Responses are UTC (`…Z`).
- **Lists:** `?limit=` (1–100, default 50) and `?offset=`; response `{ data: [...], meta: { limit, offset, count } }`.
- **Single resources:** `{ data: {...} }`.
- **Errors:** `{ error: { code, message, details? } }` — see [error codes](#error-codes).
- **Rate limits:** `API_RATE_LIMIT_PER_15_MIN` (default 1000) requests / 15 min per IP across `/api`; 20 / 15 min on `/auth/*`. The web app's own files are not limited.

## Auth

| Method & path | Who | Body / query | Returns |
|---|---|---|---|
| `POST /auth/register` | public | `full_name, email, phone, password (≥10), role?: patient \| provider_staff, clinic?, accept_terms: true, accept_privacy: true, marketing_opt_in?` | `201 { id, role, status, provider_id? }` — patients `active`, clinic sign-ups `pending` |
| `POST /auth/login` | public | `email, password` | `{ token, user }`; `403 ACCOUNT_NOT_ACTIVE` if pending/suspended |
| `GET /me` | any | — | profile + `memberships[]` for staff |

Email fields ignore invisible characters (zero-width spaces etc. picked up when copying from chat apps) and are lower-cased.

**Clinic self-registration.** A `provider_staff` may send `clinic: { legal_name, display_name, provider_type: 'clinic', registration_number, city, address, specialties[], services?[] }`.
One transaction then creates the user (`pending`), the facility (`verification_status: pending`) and an `owner`
membership, audited as `PROVIDER_SELF_REGISTERED`. `clinic` may only be sent by a `provider_staff`
(`400 VALIDATION_ERROR` otherwise); a duplicate `registration_number` is `409 ALREADY_REGISTERED`. Staff who sign
up **without** facility details keep the older flow: they stay `pending` until an admin links them to a provider.
Nothing is published and a self-registered owner cannot sign in until an admin verifies the facility
(`POST /admin/providers/:id/verification` with `verified`). That one step also activates the facility's
**pending owner** accounts (audited `USER_ACTIVATED`, owner notified `account_approved`) — there is no second
approval on the Users page. Suspended accounts are never re-activated this way, and rejecting the facility leaves
the owner pending. After that the owner adds centres and opening hours, then manages their own team (below).

## Patient & Provider KYC

| Method & path | Who | Body | Notes |
|---|---|---|---|
| `GET /patient/kyc` | patient | — | patient's structured address, DOB, gender, ID number, emergency contact |
| `POST /patient/kyc` | patient | `address_street, address_city, address_state, address_postal, date_of_birth, gender, id_number, emergency_contact_name, emergency_contact_phone` | set or update patient KYC. `address_city`/`address_state` decide which centres `/search` shows first. |
| `GET /admin/providers/:id/kyc` | admin, operator | — | provider's KYC: CAC number, tax ID |
| `POST /admin/providers/:id/verification` | admin | `verification_status: verified \\| rejected \\| suspended` | manual KYC verification of a facility. `verified` also activates its pending owners; returns `activated_owners: [userId]` |

## Provider team (self-managed)

| Method & path | Who | Body / query | Notes |
|---|---|---|---|
| `GET /providers/:id/team` | any member of that clinic, operator, admin | — | members with `provider_role`, account `status`. Works while the facility is still pending; `404` if you are not a member |
| `POST /providers/:id/team` | `owner` of a **verified** clinic, operator, admin | `user_id, provider_role: clinician \| scheduler \| receptionist` | adds or re-roles a staff account and activates it if `pending` (they get `account_approved` + `team_invite`). `409 PROVIDER_NOT_VERIFIED` while the facility awaits verification; `409 NOT_PROVIDER_STAFF`, `409 ACCOUNT_SUSPENDED`, `409 SELF_CHANGE` |
| `DELETE /providers/:id/team/:userId` | `owner` of a verified clinic, operator, admin | — | removes a member. `409 OWNER_CHANGE_FORBIDDEN` for an owner, `409 SELF_CHANGE` for yourself, `404` if they are not on the team |
| `GET /staff-accounts` | `owner` of a verified clinic, operator, admin | `q` (2–190 chars, matched against name or email), paging | provider-staff accounts the clinic may invite — id, name, email, status only (no phone, no password hash) |

## Consents

| Method & path | Who | Body | Notes |
|---|---|---|---|
| `GET /consents/policies` | public | — | current version, title and plain-language summary of `terms`, `privacy`, `data_sharing`, `marketing` |
| `GET /consents` | any | — | my status per type: `granted`, `granted_version`, `up_to_date` (granted at the current version) |
| `POST /consents` | any | `consent_type, granted, source?: settings \| request_form` | append-only history. `terms`/`privacy` can't be withdrawn (`409 CONSENT_NOT_REVOCABLE`). Withdrawing `data_sharing` cancels the patient's bookings the clinic hasn't confirmed yet, and any visit left with no appointment (`withdrawn_requests` lists those visit ids); confirmed appointments continue |

Registration records `terms` and `privacy` (and `marketing` if opted in). A patient's `POST /appointments` needs `terms`, `privacy` and `data_sharing` at their **current** versions, else `409 CONSENT_REQUIRED` with `details.missing`.

## Notifications (in-app inbox)

| Method & path | Who | Query | Notes |
|---|---|---|---|
| `GET /notifications` | any | `unread?=true`, paging | newest first; each item `{ id, type, title, body, link, read_at, created_at }` (text rendered from the template) |
| `GET /notifications/unread-count` | any | — | `{ count }` for the header bell |
| `POST /notifications/:id/read` | owner | — | 404 for anyone else's |
| `POST /notifications/read-all` | any | — | `{ updated }` |

Notifications are created by the API in the same transaction as the change that causes them. SMS and email
copies are sent by the worker (`npm run worker`). Which events notify whom: [architecture.md](architecture.md#notifications).

## Providers (public directory)

| Method & path | Who | Query | Notes |
|---|---|---|---|
| `GET /providers` | public | `specialty` (default `dentistry`), `city` (default `Lagos`), paging | Verified + active only; public fields only |
| `GET /providers/:id` | public | — | 404 if not verified/active (a self-registered facility stays invisible until an admin verifies it) |

## Search & booking (the MVP flow)

1. The patient picks a **problem** and up to five **periods** they're free.
2. `POST /search` returns verified clinics' **centres** that treat it, with their **free times** inside those
   periods — nearest area first.
3. The patient books one free time: `POST /appointments` creates a **visit** (care request) and an
   appointment as `requested`.
4. The clinic confirms (or declines), checks the patient in (or marks no-show), then writes **notes**:
   prescription, referral, follow-up (and books it), or closing the visit.

Free times are **computed**, not stored: a centre's opening hours (Lagos wall clock, `provider_schedules`) laid
out in its appointment length, minus appointments that are `requested`, `booked`, `confirmed` or `checked_in`,
minus anything less than an hour away. **One appointment at a time per centre.** Booking locks the centre row and
re-checks the exact time, so two people can't book the same one.

| Method & path | Who | Body / query | Notes |
|---|---|---|---|
| `GET /problems` | public | — | `[{ key, label }]`: toothache, checkup, broken_tooth, gum_problems, root_canal, extraction, braces, other. Each maps to specialties (`modules/availability/problems.ts`) |
| `POST /search` | patient | `problem, periods: [{ from_date, to_date, time_of_day?: any\|morning\|afternoon\|evening }] (1–5), city?, state?` | dates are Lagos `YYYY-MM-DD`, from today to 60 days ahead, ≤ 31 days in total. Returns `{ near, problem, results[] }`; each result is a centre with `provider_name`, address, `match: same_area\|same_state\|elsewhere`, `consultation_fee` (centre fee, else clinic-wide, else `null`), `caregivers`, `free_count`, `free_times[{ starts_at, ends_at }]` (first 60). Centres with no free time are left out. Sorted by match, earliest free time, name. `near` is `city`/`state` if given, else the patient's KYC address |
| `GET /centres/:centreId/availability` | signed in | `from_date, to_date, time_of_day?` | free times at one centre (used for follow-ups) |
| `POST /appointments` | patient; clinic staff for follow-ups | **new visit:** `centre_id, starts_at, problem, has_emergency_symptoms, details?, appointment_mode?: physical\|remote, caregiver_id?` · **follow-up:** `centre_id, starts_at, care_request_id, appointment_mode?, caregiver_id?` | `starts_at` must be one of the centre's free times (`409 SLOT_UNAVAILABLE`); the end comes from the appointment length. New visit: `has_emergency_symptoms: true` → `422 EMERGENCY_REDIRECT`, nothing stored; the clinic must treat the problem (`409 NOT_A_MATCH`). Follow-up: same clinic (`409 OTHER_PROVIDER`), visit still open (`409 REQUEST_CLOSED`). A patient's booking is `requested`; a follow-up the clinic books itself is `confirmed` |

`appointment_mode: remote` means a video/voice call the clinic arranges outside CareLynk; the system only records
that it happened and its notes.

## Visits (care requests)

A visit is everything about one problem: created by the first booking, closed by a closing note.

| Method & path | Who | Notes |
|---|---|---|
| `GET /requests/mine` | patient | own visits, newest first |
| `GET /requests/:id` | the patient, staff of its clinic, operator, admin | `service_type` is the problem's label, `description` the patient's words; 404 for anyone else |
| `POST /requests/:id/cancel` | the patient, operator, admin | cancels its pending appointments too |

## Appointments

| Method & path | Who | Notes |
|---|---|---|
| `GET /appointments/mine` | any | patient: own · staff: their clinics', or one via `?provider_id=` · ops: all. Includes `centre_name`, `centre_address`, `caregiver_name`, `appointment_mode` |
| `POST /appointments/:id/confirm` | clinic staff, operator, admin | `requested\|booked → confirmed` |
| `POST /appointments/:id/decline` | 〃 | `requested → cancelled` |
| `POST /appointments/:id/check-in` | 〃 | `confirmed → checked_in` — the patient showed up |
| `POST /appointments/:id/no-show` | 〃 | `confirmed → no_show` |
| `POST /appointments/:id/complete` | 〃 | `checked_in → completed` (a closing note does this too) |
| `POST /appointments/:id/cancel` | the patient, clinic staff, operator, admin | from `requested`/`booked`/`confirmed` |
| `GET /appointments/:id/notes` | the patient, staff of its clinic | anyone else gets 404 (operators and admins included: notes are clinical) |
| `POST /appointments/:id/notes` | clinic staff by role | `note_type, summary (≤ 2000)`. Only after check-in (`409 VISIT_NOT_STARTED`). `prescription`, `referral`: owner, clinician. `follow_up`, `closing_consultancy`: owner, clinician, scheduler. A closing note completes the appointment and closes the visit unless another appointment on it is still pending. The patient is notified (no clinical text in the notification) |

## Clinic set-up: centres, opening hours, dentists, fees

| Method & path | Who | Body | Notes |
|---|---|---|---|
| `GET /providers/:id/centres` | any member, operator, admin | — | a clinic's operating centres |
| `POST /providers/:id/centres` | owner, operator, admin | `name, address_line, city, state, postal_code, phone?` | `city` is the area patients are matched on (e.g. Ikeja) |
| `PUT /providers/:id/centres/:centreId` | owner, operator, admin | partial centre fields | |
| `GET /providers/:id/schedules` · `GET /providers/:id/centres/:centreId/schedules` | public | — | weekly opening hours, Lagos time |
| `PUT /providers/:id/schedules` | owner, scheduler, admin | `centre_id, schedules: [{ day_of_week 0–6, open_time, close_time, slot_duration_minutes, is_active }]` (≥ 1) | replaces that centre's week; days left out are closed. Close must be after open; one row per day |
| `GET /providers/:id/caregivers` | any member, operator, admin | — | dentists etc. per centre |
| `POST /providers/:id/caregivers` | owner, operator, admin | `centre_id, full_name, role` | |
| `GET /providers/:id/fees` | members, operator, admin, patients | — | |
| `POST /providers/:id/fees` | owner, operator, admin | `centre_id?, fee_type, amount, currency?` | `consultancy` is shown in search; a centre fee overrides the clinic-wide one |
| `PUT /providers/:id/fees/:feeId` · `DELETE …` | owner, operator, admin | | |

## Legacy: referrals, estimates, documents, payments

Still served, but **not used by the web app** since the MVP realignment ([ADR 0005](decisions/0005-mvp-realignment.md)):
referrals and prescriptions are now appointment notes; estimates and payments come later.

| Method & path | Who | Body / query | Notes |
|---|---|---|---|
| `POST /requests/:id/referrals` | clinician/owner of assigned provider, operator, admin | `receiving_provider_id, referred_specialty, clinical_summary` | general dentist → specialist handoff; `409 VISIT_REQUIRED` before the patient has been seen |
| `GET /requests/:id/referrals` | patient, related providers, operator, admin | — | referrals for request |
| `GET /referrals/mine` | staff, operator, admin | `type?: incoming \| outgoing \| all, status?` | incoming/outgoing referrals |
| `POST /referrals/:id/accept` | receiving clinician/owner, admin | — | `sent → accepted` |
| `POST /referrals/:id/decline` | receiving clinician/owner, admin | — | `sent → declined` |
| `POST /referrals/:id/complete` | receiving clinician/owner, admin | — | `accepted → completed` |
| `POST /requests/:id/estimates` | assigned provider staff, operator, admin | `amount, currency?, inclusions?, exclusions?, valid_until?` | transparent cost estimate; `409 VISIT_REQUIRED` before the patient has been seen |
| `GET /requests/:id/estimates` | patient, assigned provider, operator, admin | — | estimates for request |
| `POST /estimates/:id/accept` | patient | — | `issued → accepted` |
| `POST /estimates/:id/reject` | patient | — | `issued → rejected` |
| `POST /requests/:id/documents/upload-url` | patient, assigned provider, operator, admin | `document_type, file_name, mime_type, file_size_bytes` | returns pre-signed S3 or mock upload URL |
| `POST /requests/:id/documents` | patient, assigned provider, operator, admin | `storage_key, document_type, file_name, mime_type, file_size_bytes` | confirms upload & saves record |
| `GET /requests/:id/documents` | patient, assigned provider, operator, admin | — | lists documents with pre-signed download URLs |
| `POST /requests/:id/payments/initialize` | patient, operator, admin | `amount, currency?, callback_url?` | Paystack / mock gateway checkout initialization |
| `GET /requests/:id/payments` | patient, assigned provider, operator, admin | — | payment history for request |
| `POST /payments/webhook` | public | Paystack webhook payload + signature | processes charge.success event |
| `POST /payments/:id/simulate-success` | patient, operator, admin | — | test/demo instant payment completion |

## Admin & operations

| Method & path | Who | Body / query | Notes |
|---|---|---|---|
| `GET /admin/metrics` | admin, operator | — | counts incl. open visits, pending providers/staff |
| `GET /admin/stuck-requests` | admin, operator | — | appointments needing a nudge, one row each: `appointment_id`, `id` (visit), patient, clinic, centre, `starts_at`, `status`, `age_minutes`, `sla_category`: `request_unconfirmed_warning` (≥ 1h), `request_unconfirmed_breach` (≥ 2h), `visit_not_recorded` (confirmed, ended > 2h ago, no check-in/no-show), `notes_missing` (checked in > 24h, no outcome) |
| `GET /admin/audit-logs` | admin, operator | `action?, entity_type?, entity_id?, actor_user_id?, limit?, offset?` | append-only audit trail viewer |
| `GET /admin/users` | admin | `status?`, `role?`, paging | |
| `POST /admin/users/:id/status` | admin | `status: active \| suspended` | can't change your own |
| `GET /admin/providers` | admin, operator | `verification_status?`, paging | all providers, pending first, with `member_count` |
| `POST /admin/providers` | admin | `legal_name, display_name, provider_type, registration_number, city?, address, specialties[], services?[], latitude?, longitude?` | starts `pending` |
| `POST /admin/providers/:id/verification` | admin | `verification_status: verified \| rejected \| suspended` | `verified` also activates the facility's pending owners (see Auth) |
| `GET /admin/providers/:id/members` | admin | — | |
| `POST /admin/providers/:id/members` | admin | `user_id, provider_role` | user must be `provider_staff`; upserts role |
| `DELETE /admin/providers/:id/members/:userId` | admin | — | |

## Error codes

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input failed validation; `details.fieldErrors` maps field → messages |
| 400 | `INVALID_JSON` | Malformed JSON body |
| 401 | `UNAUTHENTICATED` | Missing/invalid/expired token |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password (same response for unknown email) |
| 403 | `FORBIDDEN` | Wrong role or not a member of the provider |
| 403 | `ACCOUNT_NOT_ACTIVE` | Pending or suspended account |
| 404 | `NOT_FOUND` | Missing, or you may not know it exists |
| 409 | `ALREADY_REGISTERED` | Email or phone taken |
| 409 | `CONSENT_REQUIRED` | Required agreements missing or outdated; `details.missing` lists them |
| 409 | `CONSENT_NOT_REVOCABLE` | Terms/privacy can't be withdrawn while holding an account |
| 409 | `INVALID_TRANSITION` | Status change not allowed from the current status |
| 409 | `DUPLICATE_PROVIDER` | Registration number exists |
| 409 | `NOT_PROVIDER_STAFF` | Only provider_staff can be linked to providers |
| 409 | `PROVIDER_NOT_VERIFIED` | The clinic is still awaiting verification, so it cannot manage its team |
| 409 | `ACCOUNT_SUSPENDED` | That staff account is suspended and cannot be added to a team |
| 409 | `OWNER_CHANGE_FORBIDDEN` | A clinic's owner membership cannot be removed |
| 409 | `SLOT_UNAVAILABLE` | That time isn't one of the centre's free times (taken, closed, too soon or off the grid) |
| 409 | `NOT_A_MATCH` | The clinic doesn't treat that problem |
| 409 | `OTHER_PROVIDER` | A follow-up must be at the visit's clinic |
| 409 | `REQUEST_CLOSED` | The visit is closed or cancelled |
| 409 | `VISIT_NOT_STARTED` | Notes only after the patient is checked in |
| 409 | `SELF_CHANGE` | Admins can't change their own status; staff can't remove themselves from their own clinic |
| 409 | `VISIT_REQUIRED` | Estimate, referral or treatment planning before the patient has been seen |
| 422 | `EMERGENCY_REDIRECT` | Emergency symptoms: call 112; nothing stored |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL` | Unexpected error (logged server-side) |

## Example: search and book with curl

```bash
API=http://localhost:4000/api/v1
TOKEN=$(curl -s -XPOST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"patient@carebridge.local","password":"CareBridge!2026"}' | jq -r .data.token)

# what's free for a toothache next week, mornings
curl -s -XPOST $API/search -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "problem":"toothache",
  "periods":[{"from_date":"2026-11-16","to_date":"2026-11-20","time_of_day":"morning"}] }' \
  | jq '.data.results[] | {provider_name, centre_name, match, first: .free_times[0].starts_at}'

# book one of those times
curl -s -XPOST $API/appointments -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "centre_id":3, "starts_at":"2026-11-16T08:00:00.000Z",
  "problem":"toothache", "has_emergency_symptoms":false, "appointment_mode":"physical" }'
```
