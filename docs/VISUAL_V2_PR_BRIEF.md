# Visual direction V2: Biomarkers, Documents, Family (flagged)

Built on `origin/main` (412946c) plus the Connected Health change. Front end only: no database, Edge Function or native change.

**Everything here is behind `EXPO_PUBLIC_VISUAL_V2=on`.** With the flag off (the default) the app looks and behaves exactly as before.

## What changes with the flag on
- **Palette (light mode):** deep green on a near-white canvas, replacing navy on cream. Dark mode is unchanged.
- **Biomarkers** (Health tab, the "Test results" section): each result is a row with the value as printed, the report's range, a small history line when there is one, and a plain label: **In range / Below range / Above range**. The label is arithmetic on the range printed on that report (the bounds the server already parses). No range, no plain number, or not yet verified → no label ("To verify" for unverified). It never says Low, High, Borderline or gives advice.
- **Documents & Records:** new title, search by file name, All / To verify chips (the existing filter), icon tiles on rows, an "Upload document" button that opens the existing add flow.
- **Family:** a strip of people shown by initials (never photos) plus Add, and a card for the person being shown with Documents and reports (count), Health and Timeline. Picking a person switches whose records the app shows. Access, invites and removal are unchanged underneath.

## Deliberately not built (no clinical basis yet)
Health Score, AI insight or advice lines ("consider…"), Action Plan, per-person score, Care Plan. Also not built: Prescriptions / Visits filters (needs a document-type field) and the showcase's five-tab bar (a navigation change; tabs are unchanged).

## Files
- New: `mobile/config/visualFlag.ts`, `mobile/services/health/rangeStatus.ts`, `mobile/components/BiomarkerRow.tsx`, `mobile/__tests__/visual-v2.test.tsx`
- Changed: `mobile/design/colors.ts`, `mobile/design/theme.ts`, `mobile/app/(tabs)/health.tsx`, `mobile/app/documents/index.tsx`, `mobile/components/StoredDocumentCard.tsx`, `mobile/app/family/index.tsx`

## Verification
tsc clean, eslint clean on touched files, jest 71 suites / 807 tests pass, iOS bundle exports with the flag on. **Not seen on a device or Simulator.** Check before turning the flag on in a TestFlight build:
1. Green on every screen, including sign-in and Home (they were designed for navy).
2. Biomarker rows on a small iPhone with a long test name and a history line.
3. Range labels against two or three real reports.

## Decision for review
The range label is new behaviour. It only restates the lab's own range, but please confirm the wording with whoever reviews clinical boundaries.
