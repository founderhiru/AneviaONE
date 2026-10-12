# M1 production-backed test plan

**Status: plan only. Nothing here has been run against production.**

## Preconditions (all required)

1. Both M1 migrations are deployed to production and verified (`docs/M1_PRODUCTION_MIGRATION_REVIEW.md` §9: 13/13, 6/6, row fingerprint unchanged).
2. **Explicit written authorisation** from the owner for this test, naming the date/time window.
3. A signed build from a recorded commit on `main` (containing PRs #9, #10 and #12), production configuration from `mobile/eas.json` (`EXPO_PUBLIC_APP_MODE=production`), distributed internally only (TestFlight internal / Play internal testing). Not submitted for review or released.

## Test account

- A dedicated account used only for this test, e.g. `aneviaone.m1test+<date>@<owner-controlled domain>`; its name and date of birth are fictional (e.g. "Test Person", 1980-01-01).
- Only synthetic reports created for the test (no real patient names, no real results).
- Never sign in to a real person's account; never open, correct or delete a real record.
- Record the account's user id at the start.

## Steps (production, after authorisation)

| # | Step | Expected |
|---|---|---|
| 1 | Install the signed build; sign up/in with the test account; set fictional name + DOB | profile saved |
| 2 | Upload synthetic report A (name matches) | facts appear; held facts show "check this is your report" |
| 3 | Open a result → Correct (value + reason) | saved; Result shows the new value, "You corrected this", reason, original in history |
| 4 | Pull to refresh; sign out/in | correction persists |
| 5 | Re-read report A | corrected value still shown; original not restored |
| 6 | Confirm a held result | confirmed; it is trusted |
| 7 | Ask a question about the corrected result | answer uses the corrected value |
| 8 | Upload report B with the same result; delete report A | the correction stays (migration 2) |
| 9 | Airplane mode during a correction | truthful error; no duplicate after reconnect |
| 10 | Delete all test reports in the app | no reports or facts left for the test user id |

## Verification (read-only SQL, test user only)

```sql
-- replace :uid with the test user id
select origin, count(*) from public.observations where user_id = :uid group by 1;
select count(*) from public.observations where user_id = :uid and origin = 'user_corrected' and superseded_at is null;
select action, created_at from public.audit_logs where user_id = :uid order by created_at;
```

Other users must be untouched. Run before and after the test; the output must be identical (`row_fingerprint.sql` itself would change, because it includes the test user's new rows):

```sql
select 'observations', md5(string_agg(to_jsonb(o)::text, '' order by o.id)) from public.observations o where o.user_id <> :uid
union all
select 'documents', md5(string_agg(to_jsonb(d)::text, '' order by d.id)) from public.documents d where d.user_id <> :uid;
```

## Stop conditions

Stop the test, record evidence and report if any of these happens: any error that touches another user's data, an original value reappearing after a reread, a duplicate correction, a verification mismatch, or a crash.

## Cleanup

Delete the test reports in the app (step 10) and confirm with the read-only queries that no fact rows remain for the test user id. In-app account deletion is currently a UI preview only (`mobile/app/privacy/index.tsx`), so removing the test auth user needs a separate, explicitly approved dashboard action; until then, keep the account disabled and unused.
