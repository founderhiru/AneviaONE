# Family release: applying PRs #30, #31 and #32 to production

**Status: rehearsed on a throwaway database with synthetic data. NOT applied to production.**
Rehearsal: `supabase/release/family/rehearse.sh` (precheck → fingerprint → apply → verify → fingerprint → rollback → fingerprint → apply again). Every row was identical before and after, and all checks passed.

## What is being applied

| PR | Migration | What it does to production |
|---|---|---|
| #30 | `20261101090000_subjects_foundation.sql` | Adds the `subjects` and `subject_access` tables. Gives every existing account one "self" record. Adds a nullable `subject_id` column to eight health tables and fills it. No grants exist. |
| #31, #32 | `20261102090000_family_access.sql` | Adds `subject_id` to two more tables. Adds read-only policies for approved people. Adds the invite table and six functions (add a relative, invite, enter a code, approve, remove, list). Recreates the six `current_*` views so they expose `subject_id`. |

Nothing is deleted or rewritten. Existing reports and results keep every value; they only gain the new column.
**Edge Function:** `health-memory` changed in #32 (it now accepts a `subject_id`). Deploy it after the migrations.
**No app build is needed** to apply this. The current builds ignore the new columns.

## Order

1. Backup. 2. Precheck. 3. Fingerprint. 4. Dry run. 5. Apply. 6. Verify. 7. Fingerprint again. 8. Deploy `health-memory`. 9. Smoke test.

Stop at any step that does not match what is written here, and send the output instead of continuing.

## Steps

All commands run in Terminal from `~/aneviaone` unless noted. SQL files are copied with `pbcopy` and pasted into **Supabase → SQL Editor**.

**0. Get the code**
```sh
cd ~/aneviaone && git checkout main && git pull
```

**1. Backup** (the Free plan keeps none for you)
Dashboard → Connect → copy the **Session pooler** connection string, and put your database password in it.
```sh
pg_dump -Fc "PASTE-CONNECTION-STRING-HERE" -f ~/aneviaone-backup-$(date +%Y%m%d).dump
ls -lh ~/aneviaone-backup-*.dump
```
The file must exist and be larger than a few KB. Keep it private: it contains health data.

**2. Precheck (read-only)**
```sh
cat supabase/release/family/prod_precheck_single_query.sql | pbcopy
```
Paste into the SQL Editor and run. Rows 2, 3, 4, 5, 6, 9 and 11 must show `ok = true`.
- Row 2 false: the account-deletion migration (20261014) is not in production. The family migration needs it. **Stop.**
- Row 3 false: the corrections migrations (M1) are not in production. They have their own approval (`docs/M1_PRODUCTION_MIGRATION_REVIEW.md`). **Stop.**
- Row 4, 5 or 6 false: some of this was already applied. **Stop.**

**3. Fingerprint (before)**
```sh
cat supabase/release/family/row_fingerprint.sql | pbcopy
```
Run it in the SQL Editor. Copy the result table into a note. It is compared after.

**4. Dry run**
```sh
npx supabase db push --dry-run
```
It must list **exactly two** migrations: `20261101090000_subjects_foundation.sql` and `20261102090000_family_access.sql`. If it lists anything else (for example 20261012, 20261013 or 20261014), **stop.**

**5. Apply** (pick a quiet moment; at your data size it takes seconds)
```sh
npx supabase db push
```
Answer `Y`. If it stops with "lock timeout", nothing was applied. Wait a minute and run it again.

**6. Verify (read-only)**
```sh
cat supabase/release/family/verify_after.sql | pbcopy
```
Run it in the SQL Editor. The last row, **ALL CHECKS**, must be `true`. Rows 6 and 7 must read `0`: nobody has a relative or a grant yet.

**7. Fingerprint (after)**
Run the same `row_fingerprint.sql` again. Every row must equal the "before" note.

**8. Deploy the function**
```sh
npx supabase functions deploy health-memory
```

**9. Smoke test (about 3 minutes)**
Open the current TestFlight build with your own account. Home, My documents and For Doctor must load as before. Open one report. Nothing about family appears yet; that arrives with the next build.

## If something goes wrong

Do not improvise. Send me the output.
- Rollback exists and was rehearsed: `supabase/release/family/rollback_family.sql`. It refuses if anyone has used the family feature, and it never touches reports, results or files.
- After running a rollback in the SQL Editor, also run:
  ```sh
  npx supabase migration repair --status reverted 20261101090000 20261102090000
  ```
  so the migration history matches.
- Restoring the backup is the last resort and loses anything written after the backup.

## Until the next app build

No one can create a relative, an invite or a grant, because the current builds have no screen for it. The family screens arrive with the next TestFlight build, after you say "build".
Before that build: reports for a relative you manage still have to be built, and shared reports cannot yet open their original file (storage access is still owner-only).
