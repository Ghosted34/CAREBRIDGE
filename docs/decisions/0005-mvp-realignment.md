# 0005 — MVP realignment: search free times, book, notes

- **Status:** accepted
- **Date:** 2026-11-11

## Context
The product owner restated the MVP: a registered patient picks a problem and the periods they're free; the
system shows clinics near their address that treat it, with open times inside those periods; the patient books
one; the clinic confirms, checks the patient in, and adds notes (follow-up, referral, prescription, or closing).
Consultations may be in person or remote; the system only records that they happened. Providers are
facilities with several operating centres.

The code had grown a different flow: an open request queue, clinics making offers, the patient accepting one,
then a multi-stage journey (assessment → treatment planned → in treatment). Slots were pre-generated rows
stored at the wrong time zone, notes were allowed before check-in and readable by anyone signed in.

## Decision
1. **Search, then book.** `POST /search` replaces the queue and offers. Matching is by problem → specialties,
   then area: same city/area, same state, elsewhere — from the patient's address text, **no geocoding** (enough
   for the pilot and the demo).
2. **Free times are computed** from each centre's opening hours (Lagos wall-clock) minus bookings; no slot rows.
   **One appointment at a time per centre.** Booking locks the centre row and re-checks the exact time.
3. **Retire** the offer round, the operator queue and the multi-stage journey from the API and the web app.
   **Keep their tables** (`provider_offers`, `provider_slots`, the extra request statuses) — dropping them gains
   nothing now and loses history.
4. **Outcomes are notes**, only after check-in. Prescriptions and referrals by owner/clinician only;
   follow-up and closing also by scheduler. Notes are readable by the patient and the clinic only.
5. Referrals, estimates, documents and payments endpoints stay but the web app no longer uses them; estimates
   beyond the consultation fee come later.

## Consequences
- Simpler for patients (one screen to a booking) and for clinics (one Bookings page by what needs doing).
- No travel-distance ranking until addresses are geocoded.
- A centre with several dentists still takes one appointment at a time; per-dentist capacity is a later change
  (`appointments.caregiver_id` is already recorded).
- Operators lose manual matching; they watch unconfirmed bookings and missing outcomes instead
  (`GET /admin/stuck-requests`).
