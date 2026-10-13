# M1 production migration review

**Status: prepared and tested on an isolated, production-like database. NOT applied to production.**
Applying either migration to production needs explicit final approval.

| # | Migration | SHA-256 | Where it is |
|---|---|---|---|
| 1 | `20261012090000_fact_corrections.sql` (444 lines) | `72ac362b15e10d160f2e5f54d2290c5ff2ebb516aef866203fb67eb11f04c061` | on `main` (PR #9, #10) |
| 2 | `20261013090000_corrections_survive_report_deletion.sql` (227 lines) | `7508356e7eb0e934d7cde34e6ff09975faf4fc8668819dbb11e36c636450cc21` | on `main` (PR #12, merged in `6221c10`) |

Supporting SQL (all executed in the review): `supabase/release/m1/`.

## 1. What each migration changes

**Migration 1 — corrections (M1).**
- Adds `correction_reason text` (nullable, no default, ≤ 500 chars) and a check constraint `<table>_reason_only_on_corrections` to the six fact tables (`encounters`, `observations`, `conditions`, `medications`, `procedures`, `allergies`).
- Replaces three shared trigger functions: `private.clinical_fact_before_insert` (a correction takes over the original's fingerprint and supersedes it first; app inserts cannot set fingerprints / interpreted values / reasons; identity safeguard), `private.clinical_fact_before_update` (identity safeguard on confirming) and `private.clinical_fact_after_insert` (no double supersede).
- Adds `public.correct_fact(text, uuid, jsonb, text)` (SECURITY DEFINER, `search_path=''`, EXECUTE for `authenticated` only) and four private helpers.
- No data is written, updated or deleted. No index, view, RLS policy or grant on tables changes.

**Migration 2 — corrections survive report deletion.**
- Re-declares `public.engine_delete_document(uuid, uuid)`: the existing body unchanged plus a step that re-records a person's correction on another report of the same person that still holds the result. Service role only (unchanged). No table DDL, no data change at deploy time.

## 2. Dependencies and order

1. **Production must already have every migration up to `20261011090000_extraction_run_diagnostics.sql`.** Confirm first with the read-only `supabase/release/m1/prod_precheck.sql` (§10). Production has not been inspected yet.
2. **Migration 1 before migration 2.** Migration 2 relies on migration 1's insert trigger (fingerprint takeover) to keep a re-recorded correction unique and reread-safe.
3. **Database before app.** Any app build from current `main` already contains the Result screen; without migration 1 saving a correction fails (generic error). Deploy migration 1 before shipping such a build.
4. PR #12 is merged (`6221c10`), so the migration 2 file on `main` is the one to deploy. Check its SHA-256 against the table above before deploying.
5. No Edge Function redeploy is needed for either migration.

## 3. Production-schema compatibility (evidence)

Isolated stack: Supabase CLI local stack, `public.ecr.aws/supabase/postgres:17.6.1.171`, separate project id and ports (56321/56322), migrations up to `20261011090000`, seeded through the real engine functions (`isolated_stack_seed.sql`): **60 users, 780 reports, 5 940 results (4 500 live, 1 440 superseded by rereads, 578 held, 82 confirmed after a hold), 900 conditions, 900 medications, 600 cross-report sources, 11 662 audit rows.**

| Check | Result |
|---|---|
| Migration 1 applied (single transaction, `lock_timeout 5s`) | no errors, ~20 ms statement time |
| Migration 2 applied | no errors, ~2 ms |
| `verify_20261012090000…sql` | 13/13 |
| `verify_20261013090000…sql` | 6/6 |
| Row fingerprint of every pre-existing row (6 fact tables, documents, fact_sources, `current_observations` membership) before vs after both migrations | **identical** |
| Existing suites on the migrated database (security isolation 45, Gate 1 engine 61, document deletion 39, identity profile 30, fact corrections 59) | all pass, 0 failures |
| `correction_deletion_test.sql` | fails at S1 with migration 1 only (the bug), **14/14 after migration 2** |

## 4. Permissions

- `correct_fact`: EXECUTE `authenticated` only; `anon` and `public` revoked; ownership enforced inside (`auth.uid()`), another person's fact reads as "not found"; RLS on fact tables unchanged.
- Helpers in `private`: EXECUTE revoked from `public`.
- `engine_delete_document`: still service role only (EXECUTE revoked from `public`, `anon`, `authenticated`; `require_service_role()` inside) — verified by `verify_20261013090000…sql`.
- No new table grants; the app still may only `insert` facts and `update (review_status)` — now with the identity safeguard on both.

## 5. Locking risk

- **Migration 1** holds an `AccessExclusiveLock` on each of the six fact tables for its whole transaction (`ADD COLUMN` + `ADD CONSTRAINT … CHECK`, which scans existing rows), plus `AccessShareLock` on `documents`. ~20 ms at the review volume; grows with table size (the check scan). While held, app reads/writes on those tables wait.
- **Tested:** with an ordinary open read transaction on `observations`, migration 1 waited and failed at its first `ALTER TABLE` after `lock_timeout = 3s` — **"canceling statement due to lock timeout"** — and **nothing was applied** (no column, no function).
- **Migration 2** takes no table locks (function replacement only).
- **Recommendation:** run migration 1 in a quiet period with `set lock_timeout = '5s'`; on timeout, retry. Never run without a lock timeout (an unbounded wait would queue all app traffic behind it).

## 6. Repeatability

- Migration 1 is **not re-runnable**: a second run fails at the first `ALTER TABLE` ("column correction_reason … already exists") inside its transaction, changing nothing (tested; 13/13 checks and data identical afterwards). Supabase's migration history prevents accidental re-application.
- Migration 2 is **re-runnable** (`create or replace`): re-run tested, no errors, 6/6 checks, data identical.

## 7. Backup and recovery

- **Before deploying:** confirm a recent production backup / PITR point exists in the Supabase dashboard (Database → Backups), and take a logical backup: `pg_dump -Fc` of the production database (tested on the isolated stack: 1.9 MB, readable, 15 public tables with data).
- **Recovery options, in order of preference:** (1) the rollback scripts below (no data loss while no reasons are stored); (2) PITR / backup restore (loses everything written after the restore point — last resort).

## 8. Rollback and its limits

Both rollback scripts were executed on the isolated stack.

| Script | Tested result |
|---|---|
| `rollback_20261013090000…sql` (run first) | restores the previous `engine_delete_document` exactly; correction-deletion test fails at S1 again (pre-fix behaviour), document deletion 39/39, fact corrections 59/59 |
| `rollback_20261012090000…sql` | restores the three trigger functions exactly as in `20261001090200`, drops `correct_fact`, helpers, constraints and `correction_reason`; pre-M1 suites (from `31b77f6`) all pass; **data identical to before either migration**; re-applying both migrations afterwards → 13/13 and 6/6 |
| Guard | with one correction reason stored, `rollback_20261012…` **refuses**: "rollback refused: 1 correction reason(s) are stored …"; nothing changed |

**Limits:**
- Once people have saved reasons, rolling back migration 1 would lose them; the script refuses unless deliberately changed after exporting them.
- Corrections already made remain as `user_corrected` rows after rollback (valid in the old schema) with their originals superseded — nothing is deleted or un-superseded.
- After rolling back migration 1, app builds with the Result screen cannot save corrections — roll back / hold the app release first.
- Rolling back migration 2 re-introduces the deletion data-loss issue.

## 9. Deployment procedure (for approval — not executed)

1. Run `supabase/release/m1/prod_precheck.sql` (read-only) in the SQL Editor → every value as in §10. (Avoid `supabase migration list --linked` without a database password: it may create a temporary login role.)
2. Confirm backup/PITR; take `pg_dump -Fc`.
3. Run `row_fingerprint.sql` against production (read-only) and save the output.
4. Apply migration 1 — e.g. via `supabase db push` after setting a lock timeout for the session, or in the SQL editor as one transaction starting `set local lock_timeout = '5s';`. On a lock timeout: wait and retry.
5. Run `verify_20261012090000…sql` → expect 13/13 (the last check is true only while no one has corrected anything).
6. Re-run `row_fingerprint.sql` → must match step 3 exactly.
7. Apply migration 2; run `verify_20261013090000…sql` → 6/6.
8. Proceed to the production-backed test plan (`docs/M1_PRODUCTION_TEST_PLAN.md`) only after explicit authorisation.

## 10. Production pre-check (read-only) — not yet run

Production state has **not** been inspected. Production can only be reached through the Supabase CLI login. `supabase migration list --linked` may create a temporary login role in production when no database password is supplied, which is a write, and reading the CLI credential directly was blocked. Run `supabase/release/m1/prod_precheck.sql` in the Supabase SQL Editor instead. It is a single read-only transaction containing only SELECTs and catalog reads, and it ends in `rollback`.

The SQL Editor shows only the **last** statement's result, which for that script is the `rollback`. Run `supabase/release/m1/prod_precheck_single_query.sql` instead. It runs the same checks as one `SELECT` and returns them all in a single table. It was verified on throwaway databases to give output identical to `prod_precheck.sql`, both before the migrations and after them (the post-deployment hashes below).

Expected output when production is ready (validated on a throwaway database built from the repository migrations up to `20261011090000`; the four function hashes are identical on Postgres 16 and on the Supabase Postgres 17.6 image):

| Check | Expected |
|---|---|
| last applied migrations | starts with `20261011090000 extraction_run_diagnostics` |
| M1 migrations already applied | `none` |
| required predecessor 20261011090000 applied | `true` |
| correction_reason columns present | `0` |
| correct_fact present | `false` |
| M1 private helpers present | `0` |
| trigger functions to replace present | `3` |
| engine_delete_document(uuid, uuid) present | `true` |
| fact triggers bound | `24` |
| user_corrected rows already present | any (informational) |
| size … | informational: lock duration of migration 1 scales with these |
| open transactions older than 1 minute | `0` at deployment time |
| md5 clinical_fact_after_insert | `d76e7ddaf7e7ff849df991d4dec0374c` |
| md5 clinical_fact_before_insert | `e14968933b7066d43d51402aae53a73d` |
| md5 clinical_fact_before_update | `9ee96ac11db6e7251992827f51893080` |
| md5 engine_delete_document | `0e0c689034c4285e7dfe6f4b65703ed8` |

Any difference, especially a function hash, means production differs from the repository. In that case stop and compare the live definition (`select pg_get_functiondef('private.clinical_fact_before_insert'::regproc)`) with `20261001090200_clinical_facts.sql` before deploying. Migration 1 replaces these functions and would silently discard any production-only change.

After both migrations are deployed, the same hashes become `8699275869c01e7b6fbb0e5e4a21f612`, `8061ea85a7f6e88ee7f43fa2f538e1cd`, `a934eee05fd4622ffe2ac8419f2f6169` and `18fe841b2f746ed41cccb8c02ca8ba70`, in the same order.

## 11. Open items / risks

- Production's applied-migration state is unverified from here (step 1).
- Production table sizes are unknown here; the migration-1 lock duration scales with them (check scan).
- No production writes are part of this review.
