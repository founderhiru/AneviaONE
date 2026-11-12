# Pilot-readiness build: data ownership Phases 1–2 + "Reports to verify" fix

Built on top of `origin/main` (0516082, PR #53). **Nothing has been applied to any database, committed, pushed or merged.** Review, then upload through GitHub.

## Principle
Record subject, document uploader, custodian, and authorised viewer/manager are four separate stored facts.
A person's records must remain theirs, even when the family member who uploaded or manages those records leaves AneviaONE.

## Decisions implemented
- D1 Managers can add documents for a family member (enforced by the database and Edge Function, not the app).
- D2 A manager deletes only their own uploads while their write access is valid. The controller can delete any. Every deletion is audited and visible to the subject.
- D3 Account deletion by a custodian is never silent: the person must decide per family member. Transfer is disabled for now, so the choices are delete that person's records, or keep the account.
- D4 Grant expiry is optional, never default. Uploader attribution survives ("Added by you / a family member / a previous family member").

## What changed
**Database (unapplied)**
- `20261113090000_vault_files.sql` — REPLACES the vault migration already in main (it is still unapplied to production). Files belong to a person (`subject_id`), not an account; `uploaded_by` + `uploaded_by_role`; `subject_activity`; storage paths keyed by person; no client DELETE grant and no storage delete policy.
- `20261114090000_custody_and_account_lifecycle.sql` — NEW. `custodian_user_id`, controller = `coalesce(linked_user_id, custodian_user_id)`, `ON DELETE RESTRICT` safety net, deletion plan, typed-name decision, person removal, notices, optional grant expiry.
- Tests: `vault_files_test.sql`, `custody_test.sql` (added to `run-local.sh`).

**Edge Functions**
- New: `delete-vault-file`, `remove-relative` (handlers in `_shared/vault-deletion`, `_shared/person-removal`, with fakes tests).
- Changed: `account-deletion` (plan / finishCustody / subject ids), `health-engine/log.ts` (`file_id` allowed), `config.toml`, `deno.json`.

**Mobile**
- Vault: managers can add; "Added by" label; delete rules; Recent activity (controller only).
- Delete account: custody decisions per person; typed DELETE stays disabled until resolved.
- Family: "Remove {Name} and their records" with the typed name.
- Home: Notices card in every home variant.
- Navigation V2 "Reports to verify" fix (R1): summary tiles and the check card now read correctly, and a report that is held again returns to the list.

## Apply order (when you decide to)
1. Replace the old vault migration with the new `20261113090000_vault_files.sql` (only because it has not run anywhere).
2. Then `20261114090000_custody_and_account_lifecycle.sql`.
3. Deploy the two new functions and the changed `account-deletion`.
Do not send the vault migration to production until the Personal Documents gates are closed.

## Verification
- tsc clean. Jest: 68 suites, 782 tests pass.
- Local database harness: 14 suites, 520 checks pass.
- Edge Function handler tests (vault-deletion 9, person-removal 7, account-deletion 21) pass.
- NOT run: real Deno (`deno test`, `deno check`) — I ran the handler tests under a Node shim; and the local Supabase end-to-end `account_deletion_local_test.ts`. Run both before any deploy.

## Deviations from the spec (please review)
1. No client-side DELETE and no storage delete policy. Deletion goes only through `vault_delete_check` → Edge Function → `vault_delete_file`.
2. Removing a relative is refused (`has_health_reports`) while that person still has health reports. Health-document ownership (Stream C) stays separate and later.
3. `uploaded_by` becomes null by the foreign key (`ON DELETE SET NULL`), not by an explicit step.
4. The delete trigger decides "this is a cascade" by "the subject no longer exists" (`pg_trigger_depth()` was always 1 in cascades).
5. A `subjects_default_custodian` trigger fills the custodian for new relatives.
6. `engine_document_identity` did not need changing.

## Known limits
- Custody transfer is disabled (Phase 6). "Claim your record" for relatives and two custodians per subject are not built.
- An upload racing with person removal is handled by a second storage sweep, not a lock.
- Feature flags unchanged: `EXPO_PUBLIC_NAV_V2`, `EXPO_PUBLIC_VAULT_FILES`, `EXPO_PUBLIC_DEMO_FAMILY`.
