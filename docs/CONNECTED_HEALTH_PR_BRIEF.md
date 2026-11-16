# Connected Health (phase 1: front end + integration-ready registry)

Built on `origin/main` (412946c). Front end only: no database change, no Edge Function, no credentials, no new native modules.

## What it is
A new page, **Connected Health**, reached from Me. Off by default; turn on with `EXPO_PUBLIC_CONNECTED_HEALTH=on` (demo builds show it).

1. Header: title, supporting line, "You choose what to connect and what to share."
2. Your sources: the one live source, **Medical records** (document count and last added date from the existing documents; Add a report → `/add`, Manage → `/documents`). "Connect a source" opens a sheet that offers only what exists today.
3. What you can bring in: one panel at a time (Platforms / Wearables / Records / Future) so the page stays short.
4. What AneviaONE does with your data: Connect → Consolidate → Understand → Track progress, with what works today and what needs a connected platform.
5. Privacy and control, linking to the existing Privacy & Security screen.

## Honesty rules (enforced by tests)
- Apple Health, Health Connect, every wearable, lab partners, ABDM/ABHA: **Coming soon**. None has a button.
- Wearables are never shown as direct; each says "Through Apple Health / Health Connect".
- Only medical records can be Available or Connected, and only through the existing upload.
- ABDM/ABHA carries "Subject to eligibility and integration requirements."
- The AI line: reads lab reports; does not diagnose or replace your Doctor.

## Files
- `mobile/config/connectedFlag.ts`
- `mobile/services/connected/integrations.ts` (registry, statuses, `SourceAdapter` interface, empty `ADAPTERS`)
- `mobile/services/connected/connectedService.ts` (records summary from `documentsService`)
- `mobile/components/connected/ConnectedParts.tsx`
- `mobile/app/connected/index.tsx`
- `mobile/app/(tabs)/me.tsx` (one flagged row)
- `mobile/__tests__/connected-health.test.tsx`, `connected-health-entry.test.tsx`

## Verification
tsc clean, eslint clean on new files, jest 70 suites / 797 tests pass, iOS bundle exports. **Not checked on a device or Simulator** — please look at spacing and the four-way switch on a small iPhone.

## Decisions to review
- Neutral icons, not brand logos. Apple Health, Fitbit, Garmin, Oura and WHOOP logos each need the owner's brand-guideline-compliant asset before use.
- Per-wearable wording ("may share through… depending on the app") is deliberately cautious; verify each when its platform adapter is built.
- "Prescriptions and other documents" are stored, not read: AneviaONE reads lab reports today.
- Mobile only. The app is iPhone-only today; there is no desktop app layout to build.

## Next phases (not built)
Apple Health adapter (needs a native module, HealthKit entitlement, App Store privacy declarations and consent text), Health Connect adapter (Android build), storage for device data, disconnect and per-type permissions.
