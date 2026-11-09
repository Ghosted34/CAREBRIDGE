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
- **Rate limits:** 300 requests / 15 min per IP overall; 20 / 15 min on `/auth/*`.

## Auth

| Method & path | Who | Body / query | Returns |
|---|---|---|---|
| `POST /auth/register` | public | `full_name, email, phone, password (≥10), role?: patient \| provider_staff, accept_terms: true, accept_privacy: true, marketing_opt_in?` | `201 { id, role, status }` — patients `active`, staff `pending` |
| `POST /auth/login` | public | `email, password` | `{ token, user }`; `403 ACCOUNT_NOT_ACTIVE` if pending/suspended |
| `GET /me` | any | — | profile + `memberships[]` for staff |

Email fields ignore invisible characters (zero-width spaces etc. picked up when copying from chat apps) and are lower-cased.

## Consents

| Method & path | Who | Body | Notes |
|---|---|---|---|
| `GET /consents/policies` | public | — | current version, title and plain-language summary of `terms`, `privacy`, `data_sharing`, `marketing` |
| `GET /consents` | any | — | my status per type: `granted`, `granted_version`, `up_to_date` (granted at the current version) |
| `POST /consents` | any | `consent_type, granted, source?: settings \| request_form` | append-only history. `terms`/`privacy` can't be withdrawn (`409 CONSENT_NOT_REVOCABLE`). Withdrawing `data_sharing` cancels the patient's requests still waiting for a provider (`withdrawn_requests` in the response); journeys with a chosen provider continue |

Registration records `terms` and `privacy` (and `marketing` if opted in). `POST /requests` needs `terms`, `privacy` and `data_sharing` at their **current** versions, else `409 CONSENT_REQUIRED` with `details.missing`.

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
| `GET /providers/:id` | public | — | 404 if not verified/active |

## Care requests

| Method & path | Who | Body / query | Notes |
|---|---|---|---|
| `POST /requests` | patient | `specialty, service_type, description (10–4000), preferred_city?, urgency?: routine\|soon\|urgent, has_emergency_symptoms (required)` | `has_emergency_symptoms: true` → `422 EMERGENCY_REDIRECT` with guidance; nothing stored |
| `GET /requests/mine` | patient | paging | own requests, newest first |
| `GET /requests/queue` | staff, operator, admin | `specialty?`, paging | open requests (`submitted`/`matching`), most urgent first. Staff: only requests matching their verified providers' specialties and city |
| `GET /requests/assigned` | staff, operator, admin | `status?`, paging | requests with a provider, incl. `patient_name`, `patient_phone`. Staff: only their providers |
| `GET /requests/:id` | owner patient, related staff, operator, admin | — | 404 for anyone else |
| `POST /requests/:id/cancel` | owner patient, operator, admin | — | expires open offers, cancels booked/confirmed appointments |
| `POST /requests/:id/start-assessment` | owner/clinician of assigned provider, operator, admin | — | `provider_accepted → assessment` |
| `POST /requests/:id/plan-treatment` | 〃 | — | `assessment → treatment_planned` |
| `POST /requests/:id/start-treatment` | 〃 | — | `treatment_planned → in_progress` |
| `POST /requests/:id/complete` | 〃 | — | `assessment` or `in_progress → completed` |

## Offers

| Method & path | Who | Body | Notes |
|---|---|---|---|
| `POST /requests/:id/offers` | owner/clinician/scheduler of `provider_id`, operator, admin | `provider_id, message?` | request → `matching`; one offer per provider per request (`409 DUPLICATE_OFFER`) |
| `GET /requests/:id/offers` | owner patient, operator, admin | — | all offers with provider name/address |
| `GET /offers/mine` | staff, operator, admin | paging | offers made by the caller's providers (all, for ops) |
| `POST /offers/:id/accept` | the requesting patient | — | assigns provider, request → `provider_accepted`, other open offers → `expired`. Does **not** book |
| `POST /offers/:id/decline` | the requesting patient | — | |
| `POST /offers/:id/withdraw` | offering provider (owner/clinician/scheduler), operator, admin | — | only while `offered` |

## Appointments & Capacity Slots

| Method & path | Who | Body | Notes |
|---|---|---|---|
| `POST /appointments` | patient (own request), staff of the assigned provider, operator, admin | `care_request_id, starts_at, ends_at, appointment_type, slot_id?` | Overlap check or atomic slot claim. Serialised per provider |
| `GET /appointments/mine` | any | paging | patient: own · staff: their providers' · ops: all |
| `POST /appointments/:id/confirm` | provider staff, operator, admin | — | `booked → confirmed` |
| `POST /appointments/:id/check-in` | 〃 | — | `confirmed → checked_in` |
| `POST /appointments/:id/complete` | 〃 | — | `checked_in → completed` |
| `POST /appointments/:id/no-show` | 〃 | — | `confirmed → no_show` |
| `POST /appointments/:id/cancel` | own patient, provider staff, operator, admin | — | from `booked`/`confirmed` |
| `GET /providers/:id/schedules` | public | — | weekly opening hours & slot duration |
| `PUT /providers/:id/schedules` | provider owner/scheduler, admin | `schedules: [{ day_of_week, open_time, close_time, slot_duration_minutes, is_active }]` | updates clinic capacity |
| `GET /providers/:id/slots` | public | `from?, to?, status?` | bookable appointment slots |
| `POST /providers/:id/slots` | provider staff, admin | `start_time, end_time` | manual slot creation |
| `POST /providers/:id/slots/generate` | provider staff, admin | `start_date, end_date` | generates slots across date range from schedule |
| `POST /slots/:id/cancel` | provider staff, admin | — | cancels open slot |

## Referrals, Estimates, Documents, Payments & Matching

| Method & path | Who | Body / query | Notes |
|---|---|---|---|
| `GET /requests/:id/matches` | patient, staff, operator, admin | — | intelligent provider matching score (0-100) and breakdown |
| `POST /requests/:id/referrals` | clinician/owner of assigned provider, operator, admin | `receiving_provider_id, referred_specialty, clinical_summary` | general dentist → specialist handoff |
| `GET /requests/:id/referrals` | patient, related providers, operator, admin | — | referrals for request |
| `GET /referrals/mine` | staff, operator, admin | `type?: incoming \| outgoing \| all, status?` | incoming/outgoing referrals |
| `POST /referrals/:id/accept` | receiving clinician/owner, admin | — | `sent → accepted` |
| `POST /referrals/:id/decline` | receiving clinician/owner, admin | — | `sent → declined` |
| `POST /referrals/:id/complete` | receiving clinician/owner, admin | — | `accepted → completed` |
| `POST /requests/:id/estimates` | assigned provider staff, operator, admin | `amount, currency?, inclusions?, exclusions?, valid_until?` | transparent cost estimate |
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
| `GET /admin/metrics` | admin, operator | — | counts incl. open requests, pending providers/staff |
| `GET /admin/stuck-requests` | admin, operator | — | SLA monitor: lists requests breaching 2h matching or 24h booking SLA |
| `GET /admin/audit-logs` | admin, operator | `action?, entity_type?, entity_id?, actor_user_id?, limit?, offset?` | append-only audit trail viewer |
| `GET /admin/users` | admin | `status?`, `role?`, paging | |
| `POST /admin/users/:id/status` | admin | `status: active \| suspended` | can't change your own |
| `GET /admin/providers` | admin, operator | `verification_status?`, paging | all providers, pending first, with `member_count` |
| `POST /admin/providers` | admin | `legal_name, display_name, provider_type, registration_number, city?, address, specialties[], services?[], latitude?, longitude?` | starts `pending` |
| `POST /admin/providers/:id/verification` | admin | `verification_status: verified \| rejected \| suspended` | |
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
| 409 | `REQUEST_NOT_OPEN` | Request no longer accepts offers |
| 409 | `REQUEST_NOT_BOOKABLE` | No provider accepted yet / request closed |
| 409 | `DUPLICATE_OFFER` | Provider already offered on this request |
| 409 | `DUPLICATE_PROVIDER` | Registration number exists |
| 409 | `NOT_PROVIDER_STAFF` | Only provider_staff can be linked to providers |
| 409 | `SLOT_UNAVAILABLE` | Overlaps an existing appointment |
| 409 | `SELF_CHANGE` | Admins can't change their own status |
| 422 | `EMERGENCY_REDIRECT` | Emergency symptoms: call 112; request not stored |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL` | Unexpected error (logged server-side) |

## Example: patient journey with curl

```bash
API=http://localhost:4000/api/v1
TOKEN=$(curl -s -XPOST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"patient@carebridge.local","password":"CareBridge!2026"}' | jq -r .data.token)

curl -s -XPOST $API/requests -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "specialty":"dentistry","service_type":"Root canal assessment",
  "description":"Persistent pain in a lower molar for three days.",
  "urgency":"soon","has_emergency_symptoms":false }'
```
