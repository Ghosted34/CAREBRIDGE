# CareBridge — Complete Step-by-Step Walkthrough Guide
### From User Account Creation to Completed Care Journey (Lagos Dental Pilot)

This document is your definitive, click-by-click instruction manual for CareBridge. It begins at **zero** (account registration and clinic onboarding), walks through **every role and action**, and covers all features so you can test and explain the entire system to doctors, operators, regulators, and investors.

---

## 1. User Roles, Creation & Onboarding

CareBridge has four distinct platform roles:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          USER ROLE TAXONOMY                            │
├────────────────────────────────────────────────────────────────────────┤
│  1. Patient           ── Self-registers ──▶ Immediately 'active'       │
│  2. Provider Staff    ── Self-registers ──▶ Starts 'pending'           │
│                                                │                       │
│  3. Admin             ── Admin portal   ──▶ Approves staff             │
│                       ── Links staff    ──▶ Verified clinic & role     │
│                                                                        │
│  4. Operator          ── Ops dashboard  ──▶ Coordinates care & SLA     │
└────────────────────────────────────────────────────────────────────────┘
```

You can populate users in two ways:
1. **Automated Seed Script**: Run `npm run seed` in `apps/api` (or `docker compose exec api node dist/db/seed.js`).
2. **Live Registration via UI**: Self-register directly in the browser at **`/register`**.

---

### Option A: The Fast Track (Seeded Test Accounts)

All seeded accounts use password: **`CareBridge!2026`**

| Role | Email | Name / Facility | Permissions & Purpose |
|---|---|---|---|
| **Patient** | `patient@carebridge.local` | Ada Patient | Requests care, accepts offers, uploads X-rays, approves estimates, pays fees. |
| **Provider (Lekki)** | `owner.lekki@carebridge.local` | Dr Lekki Owner (*Lekki Smiles Dental*) | General Dentistry & Endodontics; makes offers, schedules slots, plans treatments. |
| **Provider (Ikeja)** | `owner.ikeja@carebridge.local` | Dr Ikeja Owner (*Ikeja Dental Centre*) | General Dentistry & Orthodontics; competing clinic & referral recipient. |
| **Operator** | `operator@carebridge.local` | CareBridge Operator | Coordinates logistics, monitors 2h/24h SLA delays, manual matching. |
| **Admin** | `admin@carebridge.local` | Platform Admin | Verifies healthcare facilities, approves staff, views immutable audit logs. |

---

### Option B: Creating All Users from Scratch (Click-Through)

#### Step 0.1: Register a New Patient
1. Open **`http://localhost:3000/register`**.
2. Select account type: **"I need care (patient)"**.
3. Fill in:
   - **Full name:** `Chidi Okonkwo`
   - **Email:** `chidi@carebridge.local`
   - **Phone:** `08023456789`
   - **Password:** `CareBridge!2026` (minimum 10 characters)
4. Check **"I agree to the Terms of Service"** and **"I agree to the Privacy Policy"**.
5. Click **Create account**.
   - **What happens:** The account is created with status **`active`**. The patient can immediately log in and submit care requests.

#### Step 0.2: Register a New Clinic Staff Member
1. Open **`/register`** (or log out first).
2. Select account type: **"I work at a healthcare provider"**.
3. Fill in:
   - **Full name:** `Dr Folake Balogun`
   - **Email:** `folake@lekkismiles.local`
   - **Phone:** `08034567890`
   - **Password:** `CareBridge!2026`
4. Check the mandatory Terms and Privacy consents.
5. Click **Create account**.
   - **What happens (Security & Governance Rail):** The staff account is created with status **`pending`**. Dr Folake **cannot** log in yet (`403 ACCOUNT_NOT_ACTIVE`). This prevents unauthorized parties from impersonating clinic doctors or reading patient health records.

#### Step 0.3: Admin Approves Staff & Links to Verified Clinic
1. Open **`/login`** and sign in as **`admin@carebridge.local`** / `CareBridge!2026`.
2. Click **Users** (`/ops/users`).
3. You will see `Dr Folake Balogun` listed with a gold **Pending review** badge.
4. Click **Approve**. Her status transitions to green **Active**.
5. Click **Providers** (`/ops/providers`).
6. Click **Staff** next to *Lekki Smiles Dental*.
7. Select `Dr Folake Balogun`, set role to **Clinician** (or **Owner** / **Scheduler**), and click **Add member**.
   - **What happens:** Dr Folake is now legally and cryptographically linked to Lekki Smiles Dental. She can now log in, receive incoming dental requests in her queue, and manage patient appointments.

---

## 2. Complete End-to-End Walkthrough (18 Chronological Steps)

> **Testing Setup:** Open **Window 1** for the **Patient** (`patient@carebridge.local`), and **Window 2 (Incognito / Second Browser)** for the **Provider** (`owner.lekki@carebridge.local`).

---

### Phase 1: Discovery & Emergency Triage

#### Step 1: Browse Public Clinic Directory
- **Actor:** Patient (unauthenticated or authenticated)
- **URL:** `/providers`
- **Actions:**
  1. Filter by specialty: **Dentistry**.
  2. Filter by city: **Lagos**.
- **What to Observe:**
  - Verified Lagos dental practices appear (*Lekki Smiles Dental* on Admiralty Way, Lekki Phase 1; *Ikeja Dental Centre* on Allen Avenue, Ikeja).
  - Unverified or suspended clinics are excluded.

#### Step 2: Emergency Symptom Safety Check (The Redirection Rail)
- **Actor:** Patient (`patient@carebridge.local`)
- **URL:** `/patient/new`
- **Actions:**
  1. Select Category: **Dentistry**.
  2. Toggle: **"Yes — I have emergency symptoms"** (e.g. difficulty swallowing/breathing, trauma, uncontrollable bleeding).
- **What to Observe:**
  - An immediate red **Emergency Care Guidance Modal** halts the workflow.
  - The patient is instructed to immediately call national emergency hotlines (**112** or **199**).
  - **Clinical Governance Verification:** The API returns `422 EMERGENCY_REDIRECT`. The request is **never** saved to MySQL or queued for routine matching.

---

### Phase 2: Care Request & Matching

#### Step 3: Submitting a Standard Care Request
- **Actor:** Patient (`patient@carebridge.local`)
- **URL:** `/patient/new`
- **Actions:**
  1. Toggle: **"No emergency symptoms"**.
  2. Urgency: Select **Soon** (or **Urgent**).
  3. Service requested: `Root Canal Assessment`.
  4. Preferred area: `Lekki Phase 1`.
  5. Description: `"Severe throbbing pain in lower right first molar for two days. Pain increases with hot liquids."`
  6. Click **Send request**.
- **What to Observe:**
  - Request is stored with status **`submitted`**.
  - Append-only audit record `CARE_REQUEST_CREATED` is logged inside the transaction.
  - Redirected to `/patient/requests/:id` with a green confirmation banner.

#### Step 4: Intelligent Clinic Match Ranking
- **Actor:** Patient or Operator
- **URL:** `/patient/requests/:id`
- **Actions:**
  1. Scroll down to the **Clinic Match Ranking** card.
- **What to Observe:**
  - CareBridge's multi-factor matching algorithm evaluates all verified facilities in Lagos:
    - **Clinical specialty fit (0–40 pts):** Evaluates dental & endodontics alignment (40/40).
    - **Verification status (0–20 pts):** Verified facility credential tier (20/20).
    - **Location proximity (0–20 pts):** Island/Lekki proximity (20/20).
    - **Real slot capacity (0–10 pts):** Active schedules and available slots (10/10).
    - **Response performance (0–10 pts):** Clinic responsiveness (10/10).
  - Ranks *Lekki Smiles Dental* at **90% Match — Excellent**.

---

### Phase 3: Clinic Queue, Bidding & Acceptance

#### Step 5: Multi-Clinic Competition in Provider Queue
- **Actor:** Clinic 1 — Dr Lekki (`owner.lekki@carebridge.local`)
- **URL:** `/provider` (Request Queue)
- **Actions:**
  1. Patient's request appears in the queue with an **Urgent** / **Soon** badge.
  2. Click **Make offer**.
  3. Message: `"Our endodontic team is available tomorrow morning. We can take digital X-rays and evaluate your root canal."`
  4. Click **Send offer**.
- **What to Observe:**
  - Request transitions from `submitted` → `matching`.
  - Clinic 2 (`owner.ikeja@carebridge.local`) can also view the request and submit a competing bid with independent notes.

#### Step 6: Patient Review & Offer Acceptance
- **Actor:** Patient (`patient@carebridge.local`)
- **URL:** `/patient/requests/:id`
- **Actions:**
  1. Refresh the page. Both clinic offers appear side-by-side with clinic addresses and notes.
  2. Click **Choose** on *Lekki Smiles Dental*.
- **What to Observe:**
  - Request transitions to **`provider_accepted`**.
  - Lekki Smiles is permanently assigned as the treating provider.
  - Ikeja Dental's offer immediately switches to **`expired`**.
  - An in-app alert is pushed to Lekki Smiles Dental staff.

---

### Phase 4: Real Capacity Slots & Scheduling

#### Step 7: Clinic Schedule & Automated Slot Generation
- **Actor:** Clinic Staff (`owner.lekki@carebridge.local`)
- **URL:** `/provider/capacity`
- **Actions:**
  1. View the clinic's operating schedule (Monday–Friday 09:00–17:00, 30-minute consultation slots).
  2. Click **Generate slots**.
  3. Pick a 14-day date range and click **Generate slots**.
- **What to Observe:**
  - Generates dozens of discrete, bookable appointment records in UTC/Lagos time.
  - Staff can view all slots and cancel any slot with one click.

#### Step 8: Patient Books from Real Clinic Capacity
- **Actor:** Patient (`patient@carebridge.local`)
- **URL:** `/patient/requests/:id`
- **Actions:**
  1. Under **Book an appointment**, open the **"Choose available clinic slot"** dropdown.
  2. Select an available slot (e.g. `Tomorrow at 10:00 AM`).
  3. The form automatically anchors to Lagos wall-clock time and duration.
  4. Appointment type: Select **Assessment**.
  5. Click **Book appointment**.
- **What to Observe:**
  - Appointment is created with status **`booked`**.
  - The chosen slot atomically switches to **`booked`** linked to this appointment.
  - **Double-Booking Guard:** If another user attempts to book the same time or slot, the database row-lock serializes the check and returns `409 SLOT_UNAVAILABLE`.

---

### Phase 5: Financial Transparency & Diagnostics

#### Step 9: Clinic Issues Itemized Cost Estimate
- **Actor:** Clinic Staff (`owner.lekki@carebridge.local`)
- **URL:** `/provider/patients` (My Patients)
- **Actions:**
  1. Locate the patient's card and click **Issue estimate**.
  2. Amount: `45,000` NGN.
  3. Inclusions: `"Digital periapical X-ray, pulp vitality diagnostic, local anesthesia"`.
  4. Exclusions: `"Permanent crown restoration, prescription antibiotics"`.
  5. Click **Issue estimate**.
- **What to Observe:**
  - An estimate record is created with status `issued`.
  - Notification sent to the patient via in-app inbox and SMS.

#### Step 10: Patient Reviews & Approves Cost Estimate
- **Actor:** Patient (`patient@carebridge.local`)
- **URL:** `/patient/requests/:id`
- **Actions:**
  1. Refresh the page; inspect the new **Cost Estimates** card.
  2. Review inclusions and exclusions.
  3. Click **Approve**.
- **What to Observe:**
  - Status transitions to **Approved** with a green badge.
  - Ensures total cost transparency before any clinical procedure begins.

#### Step 11: Patient Uploads Diagnostic X-Ray
- **Actor:** Patient (`patient@carebridge.local`)
- **URL:** `/patient/requests/:id`
- **Actions:**
  1. Under **Clinical documents & X-rays**, select document type: **X-ray**.
  2. Click **Choose file** and select a diagnostic image or PDF.
- **What to Observe:**
  - Client requests a pre-signed temporary upload URL from `/documents/upload-url`.
  - File is uploaded to encrypted object storage.
  - File metadata is recorded in `clinical_documents` with an expiring signed download token.
  - Files are **never** stored as raw binary blobs in MySQL text fields.

#### Step 12: Paystack Payment & Consultation Deposit
- **Actor:** Patient (`patient@carebridge.local`)
- **URL:** `/patient/requests/:id`
- **Actions:**
  1. Under **Payments & Deposits**, click **Make payment**.
  2. Amount: `15,000` NGN consultation deposit.
  3. Click **Initialize payment**.
  4. A pending payment record is created with transaction reference `CB_PAY_...`.
  5. Click **Simulate pay** (development gateway test):
- **What to Observe:**
  - HMAC-SHA512 webhook signature verification processes the charge success.
  - Status updates to green **Paid**.
  - Payment receipt is recorded and audit log `PAYMENT_COMPLETED` is captured.

---

### Phase 6: Clinical Care & Specialist Referrals

#### Step 13: Progressing the Clinical Journey
- **Actor:** Clinic Staff (`owner.lekki@carebridge.local`)
- **URL:** `/provider/patients`
- **Actions:**
  1. Click **Start assessment** → Status transitions to **`assessment`**.
  2. After physical examination, click **Treatment planned** → Status moves to **`treatment_planned`**.
  3. Click **Start treatment** → Status moves to **`in_progress`**.
- **What to Observe:**
  - The visual timeline on the patient's portal advances at every stage.
  - Patient receives progress notifications without revealing sensitive clinical details in alerts.

#### Step 14: Specialist Clinical Referral (General Dentist → Specialist)
- **Actor:** Clinic Staff (`owner.lekki@carebridge.local`)
- **URL:** `/provider/patients`
- **Actions:**
  1. Patient requires specialist orthodontics or complex surgery. Click **Refer patient**.
  2. Receiving Clinic: Select *Ikeja Dental Centre*.
  3. Referred Specialty: `Orthodontic Consultation`.
  4. Clinical Summary: `"Patient completed primary endodontic stabilization. Requires orthodontic alignment for class II malocclusion."`
  5. Click **Send referral**.
- **What to Observe:**
  - Referral is created with status **`sent`**.
  - **Confidentiality Check:** The `clinical_summary` is redacted from all audit logs and server logs.

#### Step 15: Receiving Clinic Accepts & Completes Referral
- **Actor:** Receiving Specialist (`owner.ikeja@carebridge.local`)
- **URL:** `/provider/referrals`
- **Actions:**
  1. Open the **Incoming referrals** tab.
  2. Inspect the handover notes.
  3. Click **Accept referral** → Status updates to `accepted`.
  4. Once consultation is completed, click **Mark referral completed** → Status moves to `completed`.

#### Step 16: Concluding the Journey
- **Actor:** Clinic Staff (`owner.lekki@carebridge.local`)
- **URL:** `/provider/patients`
- **Actions:**
  1. Click **Mark completed**.
- **What to Observe:**
  - Journey reaches final status **`completed`**.
  - The patient receives a closing notification wishing them a full recovery.

---

### Phase 7: Operations, Governance & Tooling

#### Step 17: Operator SLA Monitor & Stuck Requests
- **Actor:** Operator (`operator@carebridge.local`)
- **URL:** `/ops/sla`
- **Actions:**
  1. Open the SLA dashboard.
- **What to Observe:**
  - Automated detection of bottlenecked requests across Lagos:
    - **SLA Breach (> 2 hours):** Patient requests waiting without an initial clinic offer.
    - **Booking Delay (> 24 hours):** Accepted requests without scheduled visits.
    - **Stalled Journeys (> 7 days):** Requests lingering in assessment without active steps.
  - Operator can click **View** to intervene or submit manual matching offers on behalf of clinics.

#### Step 18: System Audit Trail
- **Actor:** Admin (`admin@carebridge.local`)
- **URL:** `/ops/audit-logs`
- **Actions:**
  1. Filter by action: `OFFER_ACCEPTED`, `APPOINTMENT_BOOKED`, `REFERRAL_SENT`, or `PAYMENT_COMPLETED`.
  2. Filter by entity: `care_request`, `payment`, `clinical_referral`.
- **What to Observe:**
  - Complete, immutable ledger of every write operation, actor ID, email, IP address, and non-clinical metadata.

---

## 3. Interactive Developer & Mobile Experience

### Interactive OpenAPI 3.1 & Swagger Documentation
- **URL:** **`http://localhost:3000/api/v1/docs`** (direct API: `http://localhost:4000/api/v1/docs`)
- **Specification:** Raw OpenAPI 3.1 JSON available at `/api/v1/openapi.json` and `docs/openapi.yaml`.
- **Try it out:** Test any endpoint directly from the browser using Swagger UI with your JWT token.

### Progressive Web App (PWA) Mobile Experience
- **Manifest:** Configured at `/manifest.webmanifest`.
- **Offline Support:** Service worker at `/sw.js` caches shell assets and provides offline resilience.
- **Installation:** Open in Chrome, Edge, or mobile Safari/Android and click **Install CareBridge** to run as a standalone mobile application.

---

## 4. Key Talking Points for Clinical Governance & Stakeholders

When presenting CareBridge to healthcare partners, hospital directors, or NDPC regulators, emphasize these five architectural tenets:

1. **Strict Entity Separation:** A care request, an offer, a referral, an appointment, and a treatment are separate legal records with independent lifecycles. Accepting an offer assigns a provider; it does *not* create an appointment.
2. **Clinical Safety Rail:** Emergency symptoms are refused with clear 112 hotline guidance and never queued.
3. **Real Capacity vs. Guesses:** Appointments lock into clinic-verified availability slots rather than unvalidated free-text timestamps.
4. **NDPA 2023 Compliance by Design:** Terms, privacy policies, and data-sharing consents are tracked with append-only history. Sensitive clinical descriptions and referral summaries are redacted from server logs, audit logs, and push notifications.
5. **Logistics Coordination, Not Automated Diagnosis:** CareBridge connects verified healthcare logistics; clinical diagnosis and treatment choices belong exclusively to licensed healthcare professionals.
