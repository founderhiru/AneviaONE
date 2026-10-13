# Account deletion

**Status: implemented and tested on local Supabase with synthetic accounts. NOT deployed.** The migration and the `delete-account` function need explicit approval before they reach production.

## What the person sees

Privacy & Security → **Delete account**. The screen:
1. lists what is deleted (every report and its original file, every result including corrections and confirmations, identity details and consent choices, and the sign-in);
2. says it can't be undone and what is kept: an anonymous record of actions, with no name, email or health information;
3. asks the person to type `DELETE`.

On success the app signs out on the device, and Welcome says "Your account and everything in it have been deleted."

| Outcome | Server | App message |
|---|---|---|
| Deleted | 200 `{status:"deleted"}` | signs out; Welcome notice |
| Last sign-in older than 15 min | 403 `reauthentication_required` | "sign in again… Nothing has been deleted", with a sign-out button |
| A report is being read | 409 `account_busy` | "try again in a few minutes. Nothing has been deleted" |
| Started, not finished | 502 `storage_delete_failed` / 500 `delete_failed` | "started but didn't finish… some data may already be removed… try again"; retrying resumes |
| No answer (offline / timeout) | — | "can't tell whether deletion started… trying again is safe" (never "nothing changed") |

## How it works (`supabase/functions/delete-account`, migration `20261014090000_account_deletion.sql`)

1. **Authorization.** The JWT is verified with Auth (`getUser`). The person deleted is always the caller; any id in the body is ignored. The body must be exactly `{ "confirm": "DELETE" }`. **Reauthentication:** the newest `amr` timestamp in the verified token must be within 15 minutes. That timestamp is the actual sign-in time and survives token refreshes.
2. **Begin** (`engine_begin_account_deletion`, service role only, idempotent):
   - refuses with `busy` while a report is being read, and in that case marks nothing;
   - otherwise marks the account in `private.account_deletions`;
   - removes unfinished upload reservations, so an in-flight upload is refused by the Storage insert policy;
   - closes stale runs and freezes every report as `deleting`, so no reading can start;
   - audits the start with counts only.

   A trigger then refuses any new report for the account.
3. **Files.** Everything under `<user id>/` in `medical-documents` and `document-derivatives` is listed recursively, checked to be inside that prefix, and removed through the Storage API. The folder is then re-listed and must be empty. This step is needed because **`storage.objects` has no foreign key to `auth.users`** and direct SQL deletes are blocked. Deleting the user alone would silently leave every original behind.
4. **User.** `auth.admin.deleteUser` (hard delete) removes every row through the existing `on delete cascade` foreign keys:
   - `audit_logs` rows are kept with `user_id` set to null;
   - the `consents` append-only trigger lets the cascade through;
   - the deletion mark goes with the user.

Every step is safe to repeat. A failure leaves the account marked and frozen, and calling again resumes. Nothing reports "deleted" before the auth user is gone. Logs carry codes and counts only (`objects_removed` was added to the logger allow-list).

## Evidence (all local, synthetic)

| Layer | Test | Result |
|---|---|---|
| Database | `supabase/tests/account_deletion_test.sql` (in `run-local.sh`) | 24/24: who may begin, busy changes nothing, freeze, unfinished upload, stale run, no new reports or claims, retry, **real cascade removes every row in every table**, anonymous audit, another person with the same fingerprint untouched, begin after deletion |
| Database (all suites) | `run-local.sh` | every existing suite still passes with the migration |
| Function logic | `_shared/account-deletion/tests/handler_test.ts` | 13/13: order, identity from token only, 400/401/403/405/409, storage failure leaves the user, files remaining leave the user, retry, logs carry no ids |
| Real local stack | `_shared/account-deletion/tests/account_deletion_local_test.ts` | 8/8 against Auth, Storage, Postgres and the served function: 4 files removed (originals and derivatives), every row and the sign-in gone, the other person's rows and files identical, an old token is refused afterwards |
| App | `mobile/__tests__/account-deletion.test.tsx` | 14/14: service outcome mapping, exact `DELETE`, success signs out with the notice, reauth / incomplete / retry states, Privacy entry, Welcome notice |
| iOS simulator | Privacy → Delete account → type DELETE → delete, against local Supabase | Welcome shows the notice; the relaunch stays signed out. Database: user, profile, every row and the file gone, 0 sessions; the other account unchanged (fingerprint identical) |

## Not done / remaining

- **Not deployed.** Production needs, in order and each with approval:
  1. the M1 migrations, which come first (see `M1_PRODUCTION_MIGRATION_REVIEW.md`);
  2. a review of this migration, which only adds a private table, a trigger and a service-role function, with no change to existing tables or data;
  3. `supabase functions deploy delete-account`;
  4. an app build containing the screen.

  Ship the app build only after the function is deployed, or the screen will report a failure.
- **Sign in with Apple token revocation** (App Store guideline 5.1.1(v) expects apps using Sign in with Apple to revoke the user's tokens through Apple's REST API on deletion). This is not implemented: it needs the Apple client secret (key ID, team ID, private key) on the server. The screen tells Apple users how to remove the app from their Apple Account settings.
- **Google:** nothing to revoke server-side; the app signs out of Google on the device.
- **Data export** is still not available, and the Privacy screen says so.
- **Rollback:** dropping the function, trigger and table restores the previous state, because no existing object changes. Accounts already deleted cannot be restored except from a backup.
