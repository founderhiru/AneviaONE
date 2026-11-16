# Prescription reading + Apple Health (phase 1)

Built on `origin/main` (412946c) plus the Visual V2 / Connected Health changes. **Nothing applied to any database, committed, pushed or deployed.**

## 1. Prescription reading

A prescription is read like any report; the reader now keeps each medicine's details **exactly as written**.

- **Reader prompt** (`g1-extract-5`): one medication per medicine line; name without the "Tab./Cap." prefix; dose; schedule copied as written, including shorthand ("1-0-1", "OD", "BD", "SOS") which is never expanded or interpreted; route, duration, instructions; the prescribing Doctor from the same page. Hard-to-read or handwritten names get low confidence or are left out. Advice, tests ordered and follow-ups are not medications.
- **Validation**: name, dose and schedule must be in the quoted line (unchanged rule). Route, duration, instructions and prescriber are kept only when written on the cited page; one that is not is dropped on its own and the medicine stays.
- **Database**: `20261116090000_prescription_fields.sql` replaces `engine_complete_document` (same body, medications insert now fills `route_as_written`, `duration_as_written`, `instructions_as_written`, `prescriber_name`). The columns already existed. No table, policy or grant change.
- **Health record API**: medications carry duration (in the detail line), instructions and prescriber.
- **App**: Medications and the Health tab show the schedule as written, instructions, and "Prescribed by …".

**Deploy order when you choose to:** migration first, then the `process-document` and `health-memory` functions. Old reports are unchanged until read again.

**Not verified:** no real prescription has been through the live AI reader. The prompt and the larger schema are untested against the provider (four more text fields; watch for a "compiled grammar is too large" error on the first read). Handwritten prescriptions will often be held for review or read nothing. Test with 5–10 real printed prescriptions on staging before telling testers it works.

## 2. Apple Health (phase 1)

Flag: `EXPO_PUBLIC_APPLE_HEALTH=on` (also needs `EXPO_PUBLIC_CONNECTED_HEALTH=on`). Off by default.

- **Reads only**: steps, sleep, resting heart rate, workouts, last 7 days. Never writes to Apple Health.
- **Stays on the iPhone**: shown on screen, kept in memory. Not uploaded, not stored on the server, never sent to an AI provider. No database change.
- **Own record only**: belongs to the signed-in account on that iPhone. On a family member's record there is no Connect button and nothing is shown.
- **Consent first**: a sheet says what is read and where it stays, then Apple's own permission sheet follows.
- **Disconnect**: forgets the connection in the app and explains where to withdraw the permission in the Health app (iOS does not let an app revoke its own access).
- Sleep from two devices is merged so a night is not counted twice. "No data" is shown plainly; nothing is estimated. No labels such as low/high.

**Native change (affects every iOS build once merged, flag on or off):**
- New packages: `@kingstinct/react-native-healthkit` 16.2.0, `react-native-nitro-modules` 0.37.2 (`package.json`, `package-lock.json`).
- `app.json` plugin adds the HealthKit entitlement and `NSHealthShareUsageDescription`. Background delivery is off.
- It cannot run in Expo Go or the Simulator's Expo Go; it needs an EAS build.

**Before the App Store (not needed for internal TestFlight):**
- Privacy Policy and App Store privacy answers must mention Health data read on device.
- Apple expects an app with the HealthKit entitlement to show the feature. Submit with the flag on, or remove the package first.
- Lawyer review of the consent wording.

**Not verified:** I could not build or run iOS here. The code is type-checked against the package's real 16.2.0 API, unit-tested against a fake of it, the JS bundle exports, and Expo resolves the config plugin. The first real check is an EAS build on your iPhone: permission sheet appears, numbers match the Health app for the same 7 days.

## Verification
- Mobile: tsc clean; eslint clean on touched files; jest 73 suites / 822 tests; iOS bundle exports with all flags on; expo-doctor 19/21 (the 2 failures need a network connection this sandbox lacks).
- Database: local harness passes, including two new checks that prescription details are stored as written.
- Reader: validate (17), extractor (4) and health-memory (16) tests pass under a Node shim. `pipeline_test` and `radiology_and_zero_facts_test` fail under the shim on untouched main as well (the shim cannot parse PDFs), so they say nothing either way. **Run `deno test` and `deno task check` for real before deploying.**

## Files
- Supabase: `migrations/20261116090000_prescription_fields.sql`, `functions/_shared/health-engine/{extraction-schema,extractor,validate}.ts`, `functions/_shared/health-engine/tests/validate_test.ts`, `functions/_shared/health-memory/{records,memory}.ts`, `tests/gate1_engine_test.sql`
- Mobile (prescriptions): `types/health.ts`, `services/health/healthMemoryApi.ts`, `app/medications/index.tsx`, `app/(tabs)/health.tsx`, `__tests__/prescription-reading.test.tsx`
- Mobile (Apple Health): `config/appleHealthFlag.ts`, `services/connected/appleHealth.ts`, `hooks/useAppleHealth.ts`, `components/connected/AppleHealthCard.tsx`, `app/connected/index.tsx`, `services/connected/integrations.ts`, `app.json`, `package.json`, `package-lock.json`, `__tests__/apple-health.test.tsx`
