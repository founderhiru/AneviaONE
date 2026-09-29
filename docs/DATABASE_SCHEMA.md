# Database schema — Personal Health Intelligence

Status of each part:

| Part | Where | State |
|---|---|---|
| Phase 1 foundation — `profiles`, `documents`, `document_status_history`, bucket `medical-documents` | `supabase/migrations/` | **Ready to apply** (founder step, see `SUPABASE_SETUP.md`) |
| Health data model — everything else below except the two design-only tables | `supabase/migrations_proposed/` | **Proposed** — written and tested locally, needs approval before moving into `supabase/migrations/` |
| `whatsapp_connections`, `notifications` | this document only | **Design only** — no SQL until those features start |

`supabase db push` only applies `supabase/migrations/`, so proposed files can't
be applied by accident.

All SQL was executed against PostgreSQL 16 with a Supabase stand-in
(`supabase/tests/local/run-local.sh --with-proposed`): 135 security,
integrity and isolation checks pass. Nothing has been run against Supabase.

---

## 1. Conventions (apply to every table)

- **Primary keys:** `uuid` via `gen_random_uuid()`. Append-only logs use `bigint` identity.
- **Ownership:** every user-owned row has `user_id uuid not null → auth.users(id)`.
  It is stored on child tables too (not only on the parent) so every RLS
  policy is the same one-line check, and indexes stay simple.
- **Same-owner foreign keys:** parents expose `unique (id, user_id)`; children
  reference `(parent_id, user_id)`. The database therefore rejects linking a
  row to another user's document/page/fact — even from server code.
- **Timestamps:** `created_at`, `updated_at timestamptz not null default now()`;
  `updated_at` maintained by trigger `private.set_updated_at()`.
- **Enums** for closed sets (values can be added, not removed). Free text uses
  `text` with a `char_length` check.
- **Internal functions** live in schema `private`, which is not exposed by the
  Supabase API and not executable by app users.
- **Account deletion:** `on delete cascade` from `auth.users` for all health
  data; `audit_logs.user_id` is set to NULL instead (anonymous trail kept).
- **Naming:** technical names only — never the consumer brand.

### "users"

Supabase Auth owns identities in `auth.users` (email/phone/Google, sessions).
The app never writes there. The app-level user row is `public.profiles`
(1:1, created automatically at signup). "users" in product discussions =
`auth.users` + `public.profiles`.

---

## 2. Medical-data integrity model

This is the heart of the design. It applies to every **clinical fact table**
(`encounters`, `observations`, `conditions`, `medications`, `procedures`,
`allergies`), which all share the same provenance columns:

| Column | Type | Null | Meaning |
|---|---|---|---|
| `origin` | `fact_origin` | no | `extracted` (server/AI), `user_entered`, `user_corrected` |
| `document_id` | uuid | yes* | source document |
| `document_page_id` | uuid | yes* | source page (must belong to that document) |
| `extraction_run_id` | uuid | yes* | the pipeline/model run that produced it |
| `source_text` | text ≤2000 | yes* | verbatim text the value was read from |
| `source_bbox` | jsonb | yes | location on the page, for highlight |
| `confidence` | numeric(4,3) 0–1 | yes* | extraction confidence |
| `review_status` | `fact_review_status` | no | `unreviewed` / `confirmed` / `rejected` |
| `reviewed_at` | timestamptz | yes | set automatically |
| `supersedes_id` | uuid | yes | the fact this one corrects |
| `superseded_at` | timestamptz | yes | set automatically when corrected |

\* **Required when `origin = extracted`** (check constraint): document, page,
run, source text and confidence. Only the server can create extracted facts;
the app can never set a confidence or an extraction run.

**Rules enforced by the database:**

1. **Originals are immutable.** The PDF can't be overwritten (no Storage update
   policy); `documents` identity/path fields can't change; the server records a
   write-once `content_sha256`.
2. **Every extracted fact is traceable** to document → page → verbatim text →
   extraction run (pipeline version, model, prompt version).
3. **AI never silently overwrites source information.** Each fact table splits
   columns into **as-written** (exactly what the document says —
   `name_as_written`, `value_as_written`, …) and **interpretation** (codes,
   normalised units, parsed numbers). As-written columns are immutable for
   everyone, including the service role. Only the server may refine
   interpretation columns, and every refinement writes an audit entry listing
   the changed columns.
4. **Corrections keep an audit trail.** A correction is a *new row*
   (`origin = user_corrected`, `supersedes_id = original`) that inherits the
   original's evidence; the original is stamped `superseded_at` and kept.
   A fact can be superseded once (correct the correction to change it again).
   Facts are never deleted by the app.
5. **Confidence** is stored per extracted fact (0–1) and can drive "needs
   review" UI. `review_status` records the person's confirmation/rejection.
6. **Derived data must be grounded.** Timeline events must reference a document
   or encounter; an insight cannot be committed without at least one
   `insight_sources` row.

"Current" data = `superseded_at is null and review_status <> 'rejected'`,
exposed as `current_<table>` views (RLS of the caller applies).

---

## 3. Tables

Legend: **R** = required (`not null`), o = optional. FK arrows show composite
same-owner keys as `(x_id, user_id) → table`.

### 3.1 `profiles` — app user row *(Phase 1, ready)*

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | R | PK, = `auth.users.id` (cascade) |
| display_name | text ≤120 | o | |
| onboarding_completed_at | timestamptz | o | |
| created_at / updated_at | timestamptz | R | |

Created by trigger on signup. Index: PK.

### 3.2 `health_profiles` — self-reported baseline *(proposed)*

| Column | Type | Null | Notes |
|---|---|---|---|
| user_id | uuid | R | PK, → auth.users (cascade) |
| date_of_birth | date ≥1900 | o | |
| sex_at_birth | `sex_at_birth` | o | female / male / intersex / unknown |
| blood_group | `blood_group` | o | A+ … O-, unknown |
| height_cm | numeric(5,1) 30–272 | o | |
| created_at / updated_at | timestamptz | R | |

Measured values (weight, BP) are `observations`, not profile fields.

### 3.3 `documents` — original uploaded files *(Phase 1 + proposed columns)*

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | R | PK |
| user_id | uuid | R | → auth.users (cascade) |
| source | `document_source` | R | upload / camera |
| document_type | `document_type` | R | unclassified, blood_test (+ proposed: prescription, discharge_summary, consultation_note, imaging_report, vaccination_record), other |
| original_filename | text 1–255 | R | |
| mime_type | text | R | `application/pdf` only (for now) |
| file_size_bytes | bigint 1–20 MB | R | set from Storage on confirm |
| storage_bucket | text | R | `medical-documents` |
| storage_path | text | R | unique; **DB-assigned** `<user>/documents/<id>/original.pdf` |
| status | `document_status` | R | pending_upload → uploaded → processing → extracted → validated → completed / failed |
| processing_error | text ≤1000 | o | user-safe, server-written |
| uploaded_at | timestamptz | o | required unless pending_upload |
| *proposed:* page_count | int | o | write-once |
| *proposed:* content_sha256 | text (hex64) | o | write-once integrity hash |
| *proposed:* title, report_date, provider_name | text/date | o | server-derived display metadata |
| created_at / updated_at | timestamptz | R | |

Indexes: `(user_id, created_at desc)`; processing queue `(status, uploaded_at) where status in (uploaded, processing)`;
unique `(id, user_id)`. Lifecycle transitions are validated by trigger; only
`pending_upload → uploaded` is allowed from the app.

### 3.4 `document_status_history` — lifecycle audit *(Phase 1)*

`id bigint PK`, `document_id → documents (cascade)`, `user_id`, `from_status`,
`to_status`, `changed_by` (authenticated / service_role / system), `created_at`.
Written only by trigger. Index `(document_id, created_at)`, `(user_id)`.

### 3.5 `extraction_runs` — one processing attempt *(proposed)*

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | R | PK; unique (id, user_id) |
| user_id | uuid | R | |
| document_id | uuid | R | (document_id, user_id) → documents (cascade) |
| status | `extraction_run_status` | R | queued / running / succeeded / failed |
| pipeline_version | text ≤64 | R | |
| model_provider / model_name / prompt_version | text | o | exactly which AI produced output |
| output_storage_path | text | o | raw structured output (derivatives bucket) |
| error_code | text `[a-z0-9_]` | o | no free text / PHI |
| started_at / completed_at | timestamptz | o | completed ≥ started |
| created_at / updated_at | timestamptz | R | |

Indexes: `(document_id, created_at desc)`, `(user_id)`. Status changes audited.

### 3.6 `document_pages` — per-page derived text/image *(proposed)*

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | R | PK; unique (id, user_id), unique (id, document_id) |
| user_id | uuid | R | |
| document_id | uuid | R | → documents (cascade) |
| page_number | int 1–2000 | R | unique per document |
| text_content | text | o | text layer or OCR |
| text_source | `page_text_source` | o | pdf_text_layer / ocr (set iff text present) |
| image_storage_path | text | o | rendered page in `document-derivatives` |
| width_pt / height_pt | numeric | o | for bbox mapping |
| extraction_run_id | uuid | o | → extraction_runs |
| created_at / updated_at | timestamptz | R | |

### 3.7 `encounters` — a visit/test/admission a document describes *(proposed)*

As written: `encounter_date`, `end_date` (≥ start), `provider_name`,
`facility_name`, `reason_as_written`.
Interpretation: `encounter_type` (lab_test, consultation, hospital_admission,
procedure, immunization, imaging, other), `specialty`, `interpretation_version`.
\+ shared provenance columns (§2). Index `(user_id, encounter_date desc)`.

### 3.8 `observations` — lab results, vitals, measurements *(proposed)*

| Group | Columns |
|---|---|
| Keys | id, user_id, encounter_id → encounters |
| **As written (immutable)** | `name_as_written` R, `value_as_written` R, `unit_as_written`, `reference_range_as_written`, `abnormal_flag_as_written`, `effective_date`, `specimen` |
| Interpretation (server, audited) | `category` (laboratory, vital_sign, imaging, urine, other), `code_system` (LOINC/SNOMED/LOCAL), `code`, `display_name`, `value_numeric`, `value_text`, `value_normalized` + `unit_normalized` (UCUM), `reference_low`/`reference_high`, `interpretation_version` |
| Provenance | §2 |

Indexes: `(user_id, code, effective_date desc)` (trends), `(user_id, effective_date desc)`, `(encounter_id)`, document/run/supersedes.
**Trends are queries over current observations of one code** — no trends table.

### 3.9 `conditions` *(proposed)*

As written: `name_as_written` R, `status_as_written`, `recorded_date`, `onset_date`, `abatement_date`.
Interpretation: `code_system` (ICD10/SNOMED/LOCAL), `code`, `display_name`,
`clinical_status` (active/resolved/monitoring/unknown). Conditions are only
ever what a document or the person states — never inferred.

### 3.10 `medications` *(proposed)*

As written: `name_as_written` R, `strength_`, `dose_`, `frequency_`, `route_`,
`duration_`, `instructions_as_written`, `prescribed_date`, `start_date`,
`end_date` (≥ start), `prescriber_name`.
Interpretation: `generic_name`, `code_system` (RXNORM/LOCAL), `code`,
`status` (active/stopped/as_needed/unknown).
"Current medication list" = current rows with status active/as_needed.

### 3.11 `procedures` — procedures **and immunizations** *(proposed)*

As written: `name_as_written` R, `performed_date`, `performer_name`,
`facility_name`, `dose_number_as_written`.
Interpretation: `procedure_kind` (procedure/immunization), `code_system`
(SNOMED/CPT/CVX/LOCAL), `code`, `display_name`.
(The app's "Vaccinations" list = `procedure_kind = immunization`.)

### 3.12 `allergies` *(proposed)*

As written: `substance_as_written` R, `reaction_as_written`, `severity_as_written`, `recorded_date`.
Interpretation: `category` (medication/food/environment/other/unknown),
`severity` (mild/moderate/severe/unknown), `code_system`, `code`, `display_name`.

### 3.13 `health_events` — Timeline *(proposed, derived)*

| Column | Type | Null | Notes |
|---|---|---|---|
| id, user_id | uuid | R | |
| event_type | `health_event_type` | R | annual_check, consultation, blood_test, prescription, imaging, vaccination, procedure, other |
| event_date | date | R | |
| title | text ≤200 | R | |
| summary | text ≤500 | o | e.g. "23 results" |
| document_id / encounter_id | uuid | o | **at least one required** |
| derivation_version | text | R | lets the server rebuild the timeline |
| created_at / updated_at | | R | |

Index `(user_id, event_date desc)`. Server-written, rebuildable.

### 3.14 `insights` + `insight_sources` — What Changed / trend summaries *(proposed)*

`insights`: `insight_type` (value_change, new_medication, stopped_medication,
new_condition, trend_summary), `subject_display`, `title`, `body_text`
(neutral, non-diagnostic), `previous_value_text`, `current_value_text`, `unit`,
`effective_date`, `compared_date`, `generated_by` (rules/ai), `generator_version`,
`model_name` (required when ai), `dismissed_at`, `supersedes_id`, `superseded_at`.
Immutable except dismissal/supersession.

`insight_sources` (append-only): `insight_id` (cascade), `role`
(current/previous/supporting), exactly one of `observation_id`,
`medication_id`, `condition_id`, `procedure_id`, `allergy_id`, `encounter_id`,
or a `document_id` (+ optional `document_page_id`).
**An insight with no sources is rejected at commit.**

### 3.15 `consents` — append-only ledger *(proposed)*

| Column | Type | Null | Notes |
|---|---|---|---|
| id, user_id | uuid | R | |
| consent_type | `consent_type` | R | terms_of_service, privacy_policy, health_data_processing, ai_processing, doctor_brief_sharing, research_deidentified |
| policy_version | text ≤40 | R | which text was agreed |
| granted | boolean | R | withdrawing = new row with false |
| source | text | R | app / support |
| recorded_at | timestamptz | R | `clock_timestamp()` (strictly ordered) |
| created_at | timestamptz | R | |

View `current_consents` = latest row per type. Never updated or deleted
(except by account deletion). Replaces the in-memory Data Sharing toggles.

### 3.16 `audit_logs` — append-only trail *(proposed)*

`id bigint PK`, `user_id` (→ auth.users, **set null** on deletion), `actor`
(user/service/system), `action` (`area.verb`, e.g. `fact.user_corrected`),
`entity_table`, `entity_id`, `details jsonb` (**ids/codes/counts only — never
health values**), `created_at`. Written only by triggers/server functions;
append-only for everyone. Currently audited: fact create/correct/review/
reinterpret/supersede, extraction run status, consent decisions, insight
creation (document lifecycle is in `document_status_history`).

### 3.17 `whatsapp_connections` *(design only — no SQL yet)*

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | R | PK |
| user_id | uuid | R | unique → auth.users (cascade) |
| phone_e164_hash | text | R | HMAC of the number (lookup without storing it in clear) |
| phone_last4 | text(4) | R | for display |
| status | enum | R | not_connected / pending_verification / connected / error / disconnected |
| verified_at, connected_at, disconnected_at, last_inbound_at | timestamptz | o | |
| created_at / updated_at | timestamptz | R | |

RLS: owner SELECT; all writes server-only (Edge Function + Meta webhook).
Inbound media becomes a `documents` row with a new `document_source = whatsapp`.

### 3.18 `notifications` *(design only — no SQL yet)*

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | R | PK |
| user_id | uuid | R | → auth.users (cascade) |
| kind | enum | R | document_processed, processing_failed, new_insight, security |
| title / body | text | R | **generic, never health values** |
| entity_table / entity_id | text / uuid | o | deep-link target |
| channel | enum | R | in_app / push / whatsapp |
| sent_at, read_at | timestamptz | o | |
| created_at | timestamptz | R | |

RLS: owner SELECT; owner UPDATE `read_at` only; inserts server-only.
(Push tokens would be a separate `device_push_tokens` table when push is built.)

---

## 4. Relationships

```
auth.users 1─1 profiles
auth.users 1─1 health_profiles
auth.users 1─* documents 1─* document_pages
                         1─* extraction_runs 1─* (facts)
                         1─* document_status_history
documents/pages/runs 1─* encounters, observations, conditions, medications, procedures, allergies
encounters 1─* observations, conditions, medications, procedures, allergies, health_events
facts ─ supersedes_id ─> facts (correction chain)
insights 1─* insight_sources *─1 (a fact | a document/page)
auth.users 1─* consents, audit_logs(set null), health_events, insights
```

## 5. Storage (private buckets only)

| Bucket | State | Path | App access | Server access |
|---|---|---|---|---|
| `medical-documents` | Phase 1 (ready) | `<user>/documents/<doc>/original.pdf` | read own; upload once for own pending doc; never overwrite; delete only abandoned uploads | full (service role) |
| `document-derivatives` | proposed | `<user>/documents/<doc>/pages/<n>.webp`, `<user>/documents/<doc>/runs/<run>.json` | read own | write |
| `generated-artifacts` | design only | `<user>/doctor-briefs/<id>.pdf`, `<user>/exports/<id>.zip` | read own | write; short retention for exports |

Files are shown via short-lived signed URLs (60 s). No public URLs anywhere.
