# Backend contracts (mobile ⇄ Supabase)

The mobile app keeps its existing rule: **screens call typed services, never
Supabase directly** (`mobile/services/*`). This document fixes what each
service returns and what backs it, so backend work can proceed without UI
changes.

Backing types:

- **Table/View** — supabase-js query under the user's JWT; RLS does the
  authorization. Used for all reads and the few permitted writes.
- **RPC** — `public.<fn>()` Postgres function, runs as the caller (RLS applies).
- **Edge Function** — server code with the service role, for anything that
  needs secrets (AI keys), cross-table writes, or signed server actions.

All methods should throw a `ServiceError` with a user-safe `userMessage`, a
`code`, and `retryable`; raw backend errors are never shown. (`ServiceError`
and the Phase 1 services below exist in the pre-integration ZIP line and are
**not yet on this branch** — see `PHASE1_BACKEND_INTEGRATION.md`, "Mobile
Phase 1 port".)

---

## 1. AuthService — `services/auth` · on `main`: phone OTP + Google only · Phase 1 upgrade **pending mobile port**

| Method | Backing |
|---|---|
| `sendEmailOtp` / `verifyEmailOtp` *(pending port)* | Supabase Auth `signInWithOtp` / `verifyOtp(type: email)` |
| `sendMobileOtp` / `verifyMobileOtp` | Supabase Auth (needs SMS provider) |
| `signInWithGoogle`, `linkIdentity` | Supabase Auth OAuth (PKCE) |
| `getCurrentUser` | `auth.getSession()` + `profiles` |
| `completeOnboarding` *(pending port)* | UPDATE `profiles.onboarding_completed_at` |
| `onSignedOut` *(pending port)*, `signOut` | Supabase Auth |

## 2. DocumentsService — `services/documents` · on `main`: **mock** (`processNewDocument` simulates processing) · real Phase 1 implementation **pending mobile port**, extended in Phase 2

```ts
// Phase 1 (pending mobile port)
listDocuments(): Promise<StoredDocument[]>                 // documents (status ≠ pending_upload)
getDocument(id): Promise<StoredDocument | null>             // documents
uploadDocument(file, onStage): Promise<{ document }>        // documents + storage (reserve → upload → confirm)
getOriginalDocumentUrl(doc): Promise<string>                // storage.createSignedUrl(60 s)
// Phase 2 additions
getDocumentPages(documentId): Promise<DocumentPage[]>       // document_pages
getPageImageUrl(page): Promise<string>                      // document-derivatives signed URL (60 s)
getProcessingSummary(documentId): Promise<ProcessingSummary>// RPC get_document_summary(doc) — counts of facts/encounters/insights from that document
subscribeToDocument(id, cb): Unsubscribe                     // Realtime on documents row (status changes)
```

`ProcessingSummary = { observationCount, encounterCount, newInsightCount }` —
real counts (replaces the mock "observations / new encounters / historical
comparisons" numbers on the Add Record success screen).

Processing starts **server-side automatically** when a document reaches
`uploaded` (Database Webhook → Edge Function `process-document`). The app never
calls AI directly.

## 3. HealthRecordService — replaces mock `HealthService` · Phase 2

```ts
getObservations(filter?: { code?: string; from?: string; to?: string }): Promise<Observation[]>   // current_observations
getTrend(code: string): Promise<Trend | null>          // current_observations for one code, ordered by effective_date
getTrends(): Promise<Trend[]>                           // same, grouped by code (only codes with ≥2 points)
getWhatChanged(): Promise<HealthChange[]>               // current_insights (+ insight_sources)
getTimeline(): Promise<HealthEvent[]>                   // health_events
getEvent(id): Promise<HealthEventDetail | null>         // health_events + facts sharing its encounter/document
getMedications / getConditions / getAllergies(): Promise<…>  // current_* views
getProcedures(): Promise<Procedure[]>                   // current_procedures where procedure_kind = procedure
getVaccinations(): Promise<Vaccination[]>               // current_procedures where procedure_kind = immunization
getEvidence(ref: FactRef): Promise<Evidence>            // fact → document, page, source_text, source_bbox, confidence
confirmFact(ref) / rejectFact(ref): Promise<void>       // UPDATE review_status
correctFact(ref, values): Promise<FactRef>              // INSERT origin=user_corrected, supersedes_id=ref.id
addFact(kind, values): Promise<FactRef>                 // INSERT origin=user_entered
dismissInsight(id): Promise<void>                       // UPDATE insights.dismissed_at
```

`FactRef = { kind: 'observation' | 'medication' | 'condition' | 'procedure' | 'allergy' | 'encounter'; id: string }`.

Domain types extend today's `types/health.ts` with provenance:
`origin`, `confidence`, `reviewStatus`, `evidence: Evidence` (documentId,
documentTitle, pageNumber, excerpt). The existing `sourceDocumentId` field
maps to `document_id`. As-written values are what the UI displays; normalised
values are used only for charts/comparison, labelled as such.

## 4. ProfileService · partly Phase 2

| Method | Backing |
|---|---|
| `getHealthSummary()` (today `getHealthProfile` counts) | RPC `get_health_summary()` |
| `getHealthProfile()` / `saveHealthProfile(values)` | `health_profiles` |
| `getConsents()` / `setConsent(type, granted)` | `current_consents` / INSERT `consents` (policy_version from app config) |
| `requestDataDownload()` | Edge Function `export-my-data` → `generated-artifacts` signed link |
| `requestAccountDeletion()` | Edge Function `delete-account` (deletes Storage files **then** `auth.admin.deleteUser`) |
| `getActivity()` *(optional)* | `audit_logs` (own) — "who accessed/changed my data" |

Data Sharing toggles map to consent types: `doctor_brief_sharing`,
`research_deidentified`.

## 5. AskService — replaces mock `AiService` · Phase 3

```ts
askQuestion(question): Promise<AskQuestionResult>   // Edge Function ask-health
getSuggestedQuestions(): Promise<string[]>          // static/config, or derived from the person's data
getConversationHistory(): Promise<ConversationMessage[]>  // future ask_conversations/ask_messages tables (not designed yet)
```

Keeps today's contract exactly: `recordAnswer { text, evidence[] }` (only
facts from the person's current data, each with evidence) is separate from
`aiExplanation { text }` (clearly labelled, never diagnosis/treatment). The
Edge Function retrieves the person's own facts under their JWT (RLS), so the
model can only see that person's data.

## 6. Not started (design only)

| Service | Backing when built |
|---|---|
| WhatsAppService | Edge Functions `whatsapp-connect`, `whatsapp-webhook`; table `whatsapp_connections` |
| NotificationsService | table `notifications`; push via Expo Push from Edge Functions |
| Doctor Brief | Edge Function `doctor-brief` → `generated-artifacts`, gated by `doctor_brief_sharing` consent |

## 7. Edge Functions (none built)

| Function | Phase | Purpose | Secrets |
|---|---|---|---|
| `process-document` | 2 | pages/text → extraction → facts with evidence → insights/timeline → lifecycle | AI provider key |
| `export-my-data` | 2/3 | zip of originals + JSON of facts | — |
| `delete-account` | before launch | remove Storage objects, then the auth user (DB cascades) | service role (built-in) |
| `ask-health` | 3 | grounded Q&A | AI provider key |
| `whatsapp-*` | later | Meta Business API | Meta token |

Every Edge Function: verifies the caller's JWT (except webhooks, which verify
the provider signature), acts only on that user's rows, writes `audit_logs`,
returns user-safe errors.
