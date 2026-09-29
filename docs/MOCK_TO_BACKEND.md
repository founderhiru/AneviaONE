# Mock → backend replacement map

Inventory of every place the mobile app on **GitHub `main`** (`edd7b10`) uses
mock/local data, and what replaces it. The database side for all of it is
designed in `DATABASE_SCHEMA.md` and contracted in `BACKEND_CONTRACTS.md`.

## Real today

| Area | State on `main` |
|---|---|
| Supabase client | exists; selected only when `EXPO_PUBLIC_SUPABASE_*` are set, otherwise the app **silently uses mock sign-in** |
| Sign-in | phone OTP + Google via Supabase Auth when configured (needs an SMS provider / Google credentials); no email sign-in |

Everything else is mock. The Phase 1 real implementations (auth hardening,
email sign-in, real PDF upload, document viewer, My documents) exist in the
pre-integration ZIP line and are listed in `PHASE1_BACKEND_INTEGRATION.md`
("Mobile Phase 1 port").

## Mock data sources (`mobile/mock/`)

| Mock export | Used by (via) | Replaced by | Phase |
|---|---|---|---|
| `mockObservations`, `getObservationsByIds`, `getObservationsByName` | Health, Trends, document viewer (`documentsService.getObservationsForDocument`), Timeline detail (**direct import**) | `observations` / `current_observations` | 2 |
| `mockTrends`, `getTrendById`, `getTrendByMetricName` | Home, Health, Trend detail (`healthService`) | query over `current_observations` by `code` | 2 |
| `mockChanges` | Home, What Changed, document viewer "AI explanation" / "View previous result" (`healthService.getWhatChanged`), Add Record success counts (`documentsService`) | `current_insights` + `insight_sources` | 2 |
| `mockTimeline`, `getEventById` | Timeline, Timeline detail (`healthService`) | `health_events` | 2 |
| `groupTimelineByYear` | Timeline (**direct import**) | not data — move to a `utils/` helper | 2 (move) |
| `healthStoryYears` | Home (**direct import**) | derived from `health_events` years | 2 |
| `mockMedications` | Health, Medications (`healthService`) | `current_medications` | 2 |
| `mockConditions`, `mockAllergies` | Health (`healthService`) | `current_conditions`, `current_allergies` | 2 |
| `mockProcedures`, `mockVaccinations` | Health (`healthService`) | `current_procedures` by `procedure_kind` | 2 |
| `mockHealthProfile` | Me (`healthService.getHealthProfile`), `profileService` | RPC `get_health_summary()` | 2 |
| `mockDocuments`, `getDocumentById` | Document viewer, Add Record result (`documentsService`) | `documents` (+ `document_pages`) | 1 (port) / 2 |
| `mockConversations`, `suggestedQuestions` | Ask (`aiService`) | Edge Function `ask-health`; conversation tables TBD | 3 |

## Mock services on `main`

| Service | Mocked methods | Replaced by | Phase |
|---|---|---|---|
| `documentsService` | `processNewDocument` (ignores the picked file, simulates 5 steps, returns `mockDocuments[0]` + counts derived from mock data), `getDocuments`, `getDocumentById`, `getObservationsForDocument` | Phase 1 port: real upload/list/view (`documents`, `medical-documents`); Phase 2: `getProcessingSummary()` for the success-screen counts | 1 (port) / 2 |
| `healthService` | all 12 methods | `HealthRecordService` (BACKEND_CONTRACTS §3) | 2 |
| `aiService` | `askQuestion` (keyword-matched canned answers), suggestions, history | `AskService` → `ask-health` | 3 |
| `profileService` | health profile counts, data-sharing toggles (in-memory), export/delete (stubs) | `get_health_summary`, `consents`, Edge Functions `export-my-data`, `delete-account` | 2 / pre-launch |
| `whatsappService` | connect/disconnect/status (in-memory; also used by the onboarding WhatsApp step) | Edge Functions + `whatsapp_connections` | later |
| `authService` | selects `mockAuthService` whenever Supabase is not configured | Phase 1 port: explicit demo mode; production never falls back | 1 (port) |

## Screens (on `main`)

| Screen | Data | Real? |
|---|---|---|
| Welcome, Login, OTP | auth | real only when configured; otherwise **mock without notice** |
| Onboarding (incl. WhatsApp step) | whatsappService | ❌ mock |
| Home, Timeline, Timeline detail, Health, Trend detail, What Changed, Medications | healthService / mock | ❌ mock |
| Ask My Health | aiService | ❌ mock |
| Add Record | documentsService.processNewDocument | ❌ simulated processing |
| Document viewer (incl. AI explanation block) | documentsService + healthService | ❌ mock |
| Me | counts | ❌ mock (identity real when configured) |
| Privacy & Security, Data Sharing | profileService | ❌ stubs / in-memory |
| Doctor Brief, Family | static | ❌ placeholder |
| WhatsApp | whatsappService | ❌ mock (by design) |

## Recommended order

1. **Mobile Phase 1 port** onto `main` (reviewed separately — touches screens).
2. **Phase 2:** `process-document` → facts → `HealthRecordService` →
   evidence viewer with `document_pages`; real success-screen counts.
3. **Profile:** `get_health_summary`, consents for Data Sharing.
4. **Before real users:** `delete-account`, `export-my-data`.
5. **Phase 3:** `ask-health`. Later: WhatsApp, notifications, Doctor Brief, Family.
