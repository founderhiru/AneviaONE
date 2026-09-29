# Mock → backend replacement map

Where the mobile app (branch `phase-1-mobile-integration`) still uses
mock/sample data, and what replaces it. The database side is designed in
`DATABASE_SCHEMA.md` and contracted in `BACKEND_CONTRACTS.md`.

**Rule since Phase 1:** sample data exists only in **demo mode**
(`EXPO_PUBLIC_APP_MODE=demo`, with a visible badge). In production every
service is either real or honestly empty/unavailable — the app never shows
sample health data as the person's own.

## Real in production (Phase 1)

| Area | Implementation |
|---|---|
| Sign-in, session, sign-out, onboarding flag | `supabaseAuthService` + `profiles`; session in Keychain/Keystore |
| Upload a PDF, list/view my documents, open original | `supabaseDocumentsService` + `documents` + private `medical-documents` bucket |
| Me → document count | real count from `documentsService` |

## Honest empty/unavailable in production (until the listed phase)

| Service | Production behaviour | Replaced by | Phase |
|---|---|---|---|
| `healthService` (`productionHealthService`) | every list empty; lookups undefined; screens show their empty states | `HealthRecordService` over `current_*` views, `insights`, `health_events` | 2 |
| `aiService` (`productionAiService`) | explains that Ask isn't available yet; no record answers/evidence | `ask-health` Edge Function | 3 |
| `profileService` (`productionProfileService`) | sharing options shown off and not changeable; download/delete report "not available yet" | `consents`; Edge Functions `export-my-data`, `delete-account` | 2 / pre-launch |
| Add Record success counts | not shown (no processing summary) — "Stored securely" instead | `UploadResult.processing` from Phase 2 processing | 2 |

## Demo-mode sample data (`mobile/mock/`) — kept intentionally for UI work

| Mock export | Used via (demo only) |
|---|---|
| `mockObservations`, `mockTrends`, `mockChanges`, `mockTimeline`, `mockMedications`, `mockConditions`, `mockAllergies`, `mockProcedures`, `mockVaccinations`, `mockHealthProfile`, `healthStoryYears` | `demoHealthService` |
| `mockConversations`, `suggestedQuestions` | `demoAiService` |
| `mockDocuments`, `getDocumentById` | `sampleDocumentsService` (viewer for sample records, labelled "Sample data"), `demoDocumentsService` sample-derived counts |

Still imported directly by screens (safe in production because the screens
are only reachable with data that production doesn't return):
`groupTimelineByYear` (Timeline — a pure helper, should move to `utils/`),
`getObservationsByIds` (Timeline detail — only for sample events).

## Unchanged mocks (by design, not Phase 1)

| Service | State | Replaced by |
|---|---|---|
| `whatsappService` | in-memory preview with a "Preview only" notice (also the onboarding WhatsApp step) | Edge Functions + `whatsapp_connections` (later) |
| Doctor Brief, Family | static placeholders | later phases |

## Next

1. **Phase 2:** `process-document` → facts → `HealthRecordService` replaces
   `productionHealthService`; evidence viewer with `document_pages`; real
   success-screen counts.
2. **Profile:** `get_health_summary`, consents for Data Sharing.
3. **Before real users:** `delete-account`, `export-my-data`.
4. **Phase 3:** `ask-health`. Later: WhatsApp, notifications, Doctor Brief, Family.
