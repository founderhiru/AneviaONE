# Medicines added by hand

For prescriptions that can't be read (handwritten ones especially). Built on top of the prescription-reading change. **Nothing applied, committed, pushed or deployed.**

## What a person can do
1. **Add a medicine**: name (required), dose, when to take it, for how long, instructions, prescribed by, and Taking now / As needed / Stopped. Saved exactly as typed.
2. **From an unread prescription**: when a report was read and nothing came of it, its screen offers "Add the medicines", and the form has "View the prescription" to copy from.
3. **Change it or mark it stopped**: a new version is saved; the earlier one is kept as history.
4. **Remove one typed by mistake** (second tap to confirm). A medicine read from a report cannot be removed, only changed or stopped.

Typed-in medicines are labelled **Added by you** / **Changed by you**, so they are never mistaken for one read from a report.

## Rules (enforced in the database)
- Only the person themself, or the custodian of a relative, can add, change or remove. Managers and viewers can read only. Same rule as adding a health report.
- Stored with origin `user_entered` / `user_corrected`, never `extracted`. No codes, generic names or drug database: unknown fields are refused.
- Every add, change and removal is audited.
- No autocomplete, no checks on names or doses, no reminders, no advice. The form says so.

## One thing built differently from what I described
I said each medicine would link back to the prescription photo as its source. **It does not.** Deleting a report removes every fact tied to it, so a linked medicine would vanish if the family later replaced a blurry photo. Typed-in medicines are therefore independent of any report. A proper link needs a small schema addition (a reference that does not cascade); say if you want it.

## Also fixed
Removing a relative failed if they had any fact with no report behind it (a typed-in medicine, or a correction that outlived its report). `engine_finish_subject_removal` now removes those first. This gap existed before this change for surviving corrections.

## Files
- Supabase: `migrations/20261116100000_manual_medications.sql` (`add_medication`, `update_medication`, `remove_medication`, `engine_finish_subject_removal`), `tests/manual_medications_test.sql`, `tests/local/run-local.sh`, `functions/_shared/health-memory/{records,memory}.ts`
- Mobile: `services/health/{medicationService,demoMedicationStore,healthMemoryApi,demoHealthService}.ts`, `app/medications/{index,form}.tsx`, `app/documents/[id].tsx`, `app/(tabs)/health.tsx`, `types/health.ts`, `__tests__/manual-medications.test.tsx`

## Deploy order when you choose to
`20261116090000_prescription_fields.sql` → `20261116100000_manual_medications.sql` → deploy `health-memory` and `process-document` → then the app build. An app build that ships before the migration shows "That didn't save" on Add.

## Verification
- Database harness: all suites pass, including 28 new checks (who may add, what is refused, versions, removal, audit, deleting reports keeps typed medicines, removing a relative).
- Mobile: tsc clean, eslint clean on touched files, jest 74 suites / 835 tests, iOS bundle exports.
- Health-record API tests pass under the Node shim. Real `deno test` / `deno task check` still not run.
- **Not seen on a device.** Demo mode supports add / change / stop / remove in memory, so it can be tried in the Simulator.
