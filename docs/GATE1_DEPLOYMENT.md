# Gate 1 — document understanding: deployment and verification

How a report goes from the phone to trusted Health Memory, what must be
configured for that to work, and how to check it. Written for whoever deploys;
no secret values appear here.

## What Gate 1 does

```
App: Add Record ─► reserve row (documents, status pending_upload)
                 ─► upload original to PRIVATE bucket medical-documents
                 ─► confirm (status uploaded)
                 ─► consent (ai_processing + health_data_processing, version ai-2026-11)
                 ─► POST process-document { document_id }            (JWT; own documents only)
Server (process-document, service role, engine_* functions only):
   claim (one run at a time, max 3 attempts) ─► download original ─► SHA-256
   ─► page text: PDF text layer, or OCR transcription for scans
   ─► consent re-checked just before any AI call
   ─► structured extraction ─► deterministic validation (every fact must be
      quoted from its page; values, units, ranges, dates checked against it)
   ─► identity check against the identity the PERSON entered
   ─► one atomic write: document_pages (text + source), observations /
      medications / conditions / allergies / procedures / encounters
      (as-written wording + normalized values, page, quote, confidence,
      run, fingerprint) ─► document completed
App reads:  current_* views (trusted only) ─► Home, Health, Timeline, Ask
            observations for one document ─► the report page, held ones marked
```

### Trust rules (server-authoritative)

A fact enters trusted Health Memory (`current_*` views) only when **both**:

1. its confidence gate passed (well-evidenced, no ambiguous date, legible page); and
2. the report's identity check is `consistent` — the exact date of birth or the
   full name (all words of the shorter name, at least two) matches the
   **Identity details the person entered** (`engine_account_identity`:
   `profiles.full_name`, `health_profiles.date_of_birth`), and nothing conflicts.

Otherwise:

| Identity check   | Meaning                                                    | Result                                        |
|------------------|------------------------------------------------------------|-----------------------------------------------|
| `consistent`     | strong match, no conflict                                  | facts that passed the gate are trusted        |
| `unverifiable`   | partial overlap only, or the account has no identity entered | stored with evidence, **all held for review** |
| `no_identifiers` | report names no one                                        | stored with evidence, **all held for review** |
| `mismatch`       | a different DOB, or a name with no word in common          | document `failed` / `identity_mismatch`, **nothing stored** |

Held facts stay out of Home, Health, Timeline and Ask. They appear only on
their report's page, marked "Not yet checked". Confirming held facts is a
later phase (not part of Gate 1).

Note for existing accounts: a person who has not entered Identity details gets
every new report held. The app explains this on the report page and offers
Identity details. Reports read before this rule are not changed, and completed
reports are never re-read automatically.

## Database

All Gate 1 migrations are in `supabase/migrations` and applied to the hosted
project (verify with `supabase migration list --linked`; local and remote must
match):

`20260929120000` … `20261001090200` (base model), `20261006120000` (Gate 1
processing state, engine functions, confidence gate), `20261008090000` (OCR
page text source), `20261009090000`/`20261009090100` (deletion),
`20261010090000` (identity details + `engine_account_identity`),
`20261011090000` (`extraction_runs.diagnostics`: counts only — candidates per
fact kind returned by the model, accepted, discarded, rejected per reason —
written by `engine_record_run_diagnostics`, service role only).

A run whose model output had candidates but where **every** candidate failed
evidence/format checks now fails clearly (`validation` /
`all_candidates_rejected`, retry by the person) instead of completing as "No
health information found"; its diagnostics show why. Written radiology reports
(findings, impression, the exam itself) are extracted from the report TEXT as
imaging observations and an imaging encounter — X-ray images themselves are
not interpreted.

## Edge Functions

| Function          | Purpose                                   | Deploy                                          |
|-------------------|-------------------------------------------|-------------------------------------------------|
| `process-document`| read one document (the pipeline above)    | `supabase functions deploy process-document`    |
| `health-memory`   | trusted Health Memory summaries           | `supabase functions deploy health-memory`       |
| `ask-health`      | answers from trusted records only         | `supabase functions deploy ask-health`          |
| `delete-document` | secure deletion                           | `supabase functions deploy delete-document`     |

All have `verify_jwt = true` (`supabase/config.toml`).

### Server secrets (`supabase secrets set NAME=…`)

| Name                  | Required | Notes                                                       |
|-----------------------|----------|-------------------------------------------------------------|
| `ANTHROPIC_API_KEY`   | yes      | AI provider for extraction and OCR                           |
| `ANTHROPIC_MODEL`     | yes      | model id                                                    |
| `AI_CONSENT_VERSION`  | yes      | must equal the app's `AI_CONSENT_VERSION` (`ai-2026-11`), or every read fails with `consent_required` |
| `ANTHROPIC_INFERENCE_GEO`, `ANTHROPIC_TIMEOUT_MS`, `ANTHROPIC_MAX_RETRIES` | no | provider tuning |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | provided by Supabase | never in the app |

Check names (not values): `supabase secrets list`.

### Rollback

Functions are versioned. To roll back, check out the previous commit and run
the same `supabase functions deploy <name>`. No data migration is involved.

## Mobile builds (EAS)

`mobile/eas.json` pins every profile to `EXPO_PUBLIC_APP_MODE=production` and
to its **own** EAS environment. Backend values are never committed; they come
from the EAS environment (cloud builds) or the developer's git-ignored
`mobile/.env` (local Metro). Template: `mobile/.env.example`.

| Profile | Where the app's JS comes from | Needs | State (checked with `eas-cli env:list`) |
|---|---|---|---|
| `production` | embedded at build time | EAS `production` env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`EXPO_PUBLIC_APP_MODE` is pinned in `eas.json`) | **configured** |
| `preview` | embedded at build time | EAS `preview` env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **not configured** — a preview build opens on the "configuration required" screen |
| `development` | the developer's own Metro (dev client) | the developer's `mobile/.env` with the same two values; EAS `development` env only if a bundle is ever embedded or published to it | EAS env empty (not needed for the dev client); local `.env` present on this Mac |

To configure `preview` (the anon key is client-safe, but keep it out of the
repository):

```
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL      --value <project URL> --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>    --visibility sensitive
```

Check with `npx eas-cli env:list <environment>` and
`npx eas-cli config --platform ios --profile <profile>`.

Missing configuration is never hidden: production mode without both values
shows the "configuration required" screen and never selects a mock or sample
data (`mobile/config/appMode.ts`; tests in `__tests__/app-mode-and-auth.test.ts`).
Demo mode exists only when explicitly built with `EXPO_PUBLIC_APP_MODE=demo`,
always shows a "Demo" badge, and no EAS profile can select it
(`__tests__/eas-profiles.test.ts`).

## Verification

| What | Command | Needs |
|------|---------|-------|
| Engine, memory and ask unit tests | `cd supabase/functions && deno test --allow-all _shared/` | Deno |
| Database tests (RLS, engine functions) | `supabase/tests/local/run-local.sh` | Docker |
| Mobile tests | `cd mobile && npx jest` | Node |
| Gate 1 acceptance matrix (live) | see below | test accounts |
| Gates 1–3 synthetic journey (live) | `supabase/tests/e2e/synthetic_e2e.ts` | **fresh** test accounts — it uploads byte-identical reports and expects exact trends, so on accounts that already hold its (or the matrix's) data its per-report and trend checks fail by de-duplication, not by regression; use `gate1_matrix_e2e.ts` (re-runnable) for Gate 1 |

Live suites run against the deployed project as two **dedicated test
accounts** only (`+e2e` addresses, email sign-in only, documents prefixed
`E2E `; they refuse anything else). Configure `supabase/tests/e2e/.env.e2e`
(git-ignored): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `E2E_A_EMAIL`,
`E2E_A_PASSWORD`, `E2E_B_EMAIL`, `E2E_B_PASSWORD`. Then:

```
set -a; source supabase/tests/e2e/.env.e2e; set +a
deno run --config supabase/functions/deno.json --allow-net --allow-env --allow-read \
  supabase/tests/e2e/gate1_matrix_e2e.ts
```

The matrix covers: clear lab report, several dates, urine, scanned (OCR),
non-health file, a report naming no one, an account with no identity, a
conflicting identity, a weak identity, incomplete units/dates/ranges; retry,
duplicate-run and interrupted-upload behaviour; status ↔ fact consistency;
tenant isolation; and that responses carry no health content.

## Privacy

- Originals live only in the private `medical-documents` bucket; the app reads
  them through short-lived signed URLs.
- Function logs carry ids, counts, outcome codes and durations — never report
  text, names, dates of birth or values (`_shared/health-engine/log.ts`).
  Database errors are reduced to the operation name before logging.
- Identity details are read server-side only by `engine_account_identity`
  (service role); they are compared, never stored with the report or logged.
