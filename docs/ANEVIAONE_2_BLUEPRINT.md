# AneviaONE 2.0 — product and architecture blueprint

Status: **proposal for approval — nothing in here is built or deployed.**
Written 31 October 2026 against `main` at commit `2c81813`. Every "built" statement below was checked in the repository; "verified in production" is a separate claim that only the release gates (section 3) can make.

## 1. Position

**Evidence-first Personal Health Intelligence.** Every result traces to its report page, and every change can be reviewed and corrected. Not a file locker, not a chatbot.

Not claimed: "first AI health app". Eka Care (AI record insights, family profiles, ABHA) and ChatGPT Health (lab-result interpretation, US-first) already exist. The claim we can earn and prove is *measured, source-traced accuracy for Indian lab reports, managed for a whole family*.

## 2. Where we are (verified in the repo)

| Capability | State |
|---|---|
| Upload PDF / photo / scan, private storage, short-lived links | Built |
| Report reading with page, text, confidence; held-for-review gate (0.85 / 0.5) | Built |
| Wrong-person report refusal (identity check) | Built |
| Result detail: source page, text, versions, confirm, correct (new version, original kept) | Built (`app/facts/[id]`) |
| Printed-range-only "outside range"; same-unit comparisons only | Built — keep until validated conversions exist |
| Timeline, What Changed, Trends, medications/conditions/allergies lists | Built |
| For Doctor: on-screen hand-over + PDF, no AI | Built |
| Share into the app from WhatsApp / Gmail / Files | In build 15, **untested on a real phone** |
| Account deletion, report deletion | Built; production end-to-end **unverified** |
| Medication lifecycle | Partial: status enum (active / stopped / as_needed / unknown) exists; no dated start / stop / change history |
| Family | **Absent.** Every health row is owned by one `user_id`; `/family` is a placeholder |
| Canonical analyte + unit mapping | **Absent** |
| Expiring doctor link | **Absent** (PDF only) |
| Data export, ABDM / FHIR | **Absent** |
| Non-English reports | **Absent / unmeasured** |
| Android | Unverified |
| Measured extraction accuracy | **None** — no validation set yet |

## 3. Release gates — close before any real user data

1. AI data-flow / provider sign-off (`docs/AI_DATA_FLOW.md`: "implementation-complete, deployment-unverified"). No real user health documents to the provider until this passes.
2. Rotate the leaked Anthropic key; set a Console spend limit; confirm secrets and deployed functions.
3. Undeploy `ask-health`.
4. Production end-to-end: account deletion and report deletion with a fake account; confirm `extraction_runs`, storage and fact rows are gone.
5. Backups before real users (free plan has none).
6. Real-device pass: iPhone (build 15) incl. share-from-WhatsApp; Android build.
7. Lawyer review of Terms and Privacy; DPDP notice/consent wording.
8. Fix stale docs (`docs/MOBILE_RELEASE_AUDIT.md` still says account deletion is missing).

## 4. Architecture evolution

Principles: source documents immutable; corrections are new versions; raw, normalised and interpreted values stay separate; clinical rules are deterministic and independent of the AI provider; every insight links to evidence; the service-role key never reaches mobile; never trust a client-supplied identity.

### 4.1 Family: subject and delegated access (the big change)

Today: `auth.users → profiles → documents → facts`, all keyed by `user_id`, with composite `(id, user_id)` foreign keys.

Target — three roles that can be three different people: **account holder**, **subject** (whose records), **grantee** (who may see or manage them).

```
subjects        id, created_by_user_id, display_name, relationship, date_of_birth,
                is_self, linked_user_id (nullable: the subject's own account), deleted_at
subject_access  subject_id, grantee_user_id, role (owner | manager | viewer),
                consent_id, granted_by, expires_at, revoked_at
documents, observations, encounters, conditions, medications, procedures,
allergies, fact_sources, extraction_runs, consents
                + subject_id (not null), user_id kept as "added_by"
private.can_access(subject_id, need) -- single SQL function used by every RLS policy
```

Rules:
- Migration backfills one `is_self` subject per existing user and sets every row's `subject_id`. Reversible; run on a copy first; `supabase db push --dry-run` and the fingerprint check before production.
- Adding an **adult** relative: the subject must accept an invite from their own account (consent recorded) — a caregiver never silently owns another adult's records. Adults without a smartphone: caregiver declares authority; record it in `consents`; subject can claim the profile later.
- **Minors**: parent/guardian is owner until the child holds their own account.
- Identity check, AI consent and "For Doctor" are evaluated **per subject**.
- Deleting a caregiver's account never deletes a subject they do not own. Deleting a subject deletes its documents, files and facts; audit rows survive.
- Every cross-subject read and write goes to `audit_logs`.
- Tests first: SQL isolation tests (user A cannot read subject B without a grant; revoked and expired grants stop access; viewer cannot write).

### 4.2 Doctor Connect

`shares(id, subject_id, token_hash, scope, expires_at, revoked_at, created_by)`; a read-only web page `/s/<token>` served through an Edge Function that checks the hash, expiry and revocation, returns the For Doctor brief only (no originals unless scoped), and logs each view. Token is random, stored hashed, never logged. Patient sees "who opened it, when" and can revoke. Doctor annotations come later and require patient authorisation.

### 4.3 Canonical analytes and units

`analytes(code, name, loinc_code?)`, `analyte_aliases(alias → analyte)`, `unit_conversions(analyte, from_unit, to_unit, factor|offset, validated_by)`. Deterministic, reviewed table; no model-guessed conversions. Until an analyte has a validated conversion, comparisons stay same-unit only (current safe behaviour). Different method or specimen is never merged silently.

### 4.4 Lifelong event model

Add an `events` view/table (hospitalisation, surgery, vaccination, diagnosis, medication start / stop / change, visit) with `occurred_on`, `precision` (day / month / year), `source` (report page or user-entered), and "recorded vs not recorded vs not present" per domain. Powers **Health History Completeness**. Medication history gets dated lifecycle.

### 4.5 Later: Memory Passport and interoperability

FHIR R4 export (Patient, Observation, Condition, MedicationStatement, Procedure, Encounter, DocumentReference) plus a human-readable PDF. ABDM sandbox assessment only after real users exist.

## 5. Experience design

- **Profile switcher:** an avatar chip in the Home header ("Asha ▾"). Every tab shows the active person. When viewing someone else, a tinted banner reads "Viewing Father's records" — never ambiguous whose data is on screen.
- **Home for a family:** a People strip (self + relatives) with each person's "to verify" and "outside range" counts; tap to open that person's Home.
- **Add flow:** "Whose report is this?" defaults to the active person; wrong-person refusal still applies per subject.
- **For Doctor:** per person; "Show to Doctor" (large type), "Send PDF", and "Share link" with expiry (24 h / 7 days) and a Revoke button.
- **Evidence view:** already built; add the prior and next measurement and a "Why held" line.
- **Completeness card:** "Blood reports 2019–2026 · Medications partial · Vaccinations not recorded".
- **Language:** original text retained; optional plain explanation in the user's language; all new copy keeps the capital-D "Doctor" convention.

## 6. Delivery slices (each is a small PR; no TestFlight build until you say so)

| Slice | Content | Exit test |
|---|---|---|
| S0 | Close gates in section 3; validation harness | Gates ticked |
| S1 | Accuracy test set: ≥100 **synthetic** report formats (Indian lab layouts, units, scans) with answer keys; scorer by field | Precision / recall per field published internally |
| S2 | Family DB foundation: migrations + `can_access` + SQL isolation tests, **no UI** | Isolation suite green on a copy; dry-run clean |
| S3 | Family UI: switcher, add relative, per-person screens | Jest + real-device pass |
| S4 | Doctor Connect: share link, revoke, view log | Token, expiry and revoke tests |
| S5 | Canonical analytes + validated conversions (start with 20 common tests) | Conversion table reviewed |
| S6 | Events, medication lifecycle, completeness | Unit tests on gap logic |
| S7 | Hindi / Telugu reports measured on the S1 harness | Per-language accuracy figure |
| S8 | Export (PDF + FHIR), ABDM sandbox assessment | — |

## 7. Not doing

Diagnosis, treatment advice, a free-text health chatbot, AI health scores, ad-based or data-resale monetisation, claims of HIPAA / GDPR / certification.

## 8. Measures

Reports per active user; second-upload rate; family profiles per account; For Doctor opens and shares per month; held-for-review rate and how many are confirmed vs corrected; per-field extraction precision / recall; cost per report (from `extraction_runs`) against a plan price.

## 9. Decisions needed

1. Family consent rule for adult relatives (invite-and-accept vs caregiver declaration) — recommended: invite-and-accept, with declaration only for adults without a smartphone.
2. First build slice — recommended: S1 (accuracy set) in parallel with S2 (family DB, no UI).
3. Validation data: **synthetic only** until gate 1 passes.
