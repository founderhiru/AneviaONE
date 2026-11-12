# New navigation (NAV_V2) — PR brief

**What it is.** Bottom bar becomes Home / Health / Add / Documents / Me, behind one switch.
**Switch:** `EXPO_PUBLIC_NAV_V2=on`. Default is OFF, so a normal build keeps today's five tabs.
**Rollback:** turn the switch off and rebuild. No data is touched either way.

## What is in it
- Home (new): person switcher (shows when the account has more than one person), "What changed" card, two tiles (Health, Personal Documents), Life Management as a wide tile with a live status line (opens the existing Life Management screen), Recently added (health reports + personal documents). Reports are still read automatically, with the same consent card, as on today's Home.
- Health (tab): Overview / Timeline / Doctor Brief are today's real screens, unchanged, plus a red "Prepare for Doctor" button. Old `/(tabs)/health|timeline|doctor` routes still work; they are only hidden from the bar.
- Add (centre button): "Add a Health Report" (existing Add flow, unchanged) and "Add a Personal Document" (Choose a file / Take a photo / Choose a photo). Not shown for people whose records are view-only for you.
- Documents (tab): six categories with counts. Identity Documents has slots Aadhaar / PAN / Passport / Driving Licence; Insurance has Health / Life / Vehicle; then Education & Certificates, Property & Legal, Photos & Personal Files, Other Documents.
- Me: unchanged (family, permissions, privacy, account).

## Database (NOT applied; needs your explicit go)
`20261113090000_vault_files.sql` is reshaped (it was never applied): six categories and a new optional `kind` column (the slot). Local DB suites: 13/13 pass. Documents tab shows "not switched on yet" until `EXPO_PUBLIC_VAULT_FILES=on` (demo builds always show it).

## Tested
tsc clean; full jest 758/758 with the switch off; new `nav-v2.test.tsx` (10 tests) covers Add sheet, Home, Health hub, Documents tab, reading-consent on Home. With the switch ON, 7 older suites fail only because they test today's Home/tab bar (expected; they stay valid while the switch is off).

## Not in this PR (deliberately)
- Life Management filters (Appointments / Renewals): the existing reminders list is reused as it is.
- Demo mode has one person, so family switching can only be tried with a real account (the earlier clickable preview shows the journey with synthetic family).
- Owner-only uploads kept: a manager cannot add a Personal Document to a parent's folder (open decision).
- App lock, expiry reminders UI, rename file; owner-deletion policy; Aadhaar/PAN legal review.

## Try it in the Simulator
`cd mobile && EXPO_PUBLIC_APP_MODE=demo EXPO_PUBLIC_NAV_V2=on npx expo start --clear`  (press `i`; sign in with any phone, code 123456)

## Validation pass (added)
- Demo family: `EXPO_PUBLIC_DEMO_FAMILY=on` (demo mode only, off by default) adds fictional Dad and Mum with their own documents and reminders. Sample health reports belong to Me only; Dad and Mum show empty health.
- Identity slots show Not added / Added / Expiring soon (within 90 days) / Expired, from an optional expiry date typed when adding (YYYY-MM-DD). No identity numbers are stored or shown. The date is saved in the existing `expires_on` column.
- Add sheet has an "Adding for" person picker; view-only people cannot be added to.
- Home tiles equal height with aligned text; Health hub no longer repeats the person bar and title.
- Tests: 768 pass (new: demo-family, slot status, expiry entry).
