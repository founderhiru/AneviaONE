# Row Level Security & access design

## Principles

1. **Default deny.** Every table has RLS enabled and every client privilege is
   revoked, then granted back table-by-table and **column-by-column**.
2. **Own data only.** Every policy is `(select auth.uid()) = user_id`. There
   are no cross-user policies (no family/doctor sharing yet — see decisions).
3. **Three layers** — a malicious client calling the API directly must defeat
   all of them:
   - *Grants* — which columns the `authenticated` role may insert/update.
   - *RLS policies* — which rows.
   - *Triggers* — lifecycle and integrity rules (who may set which status,
     immutability, provenance, same-owner links).
4. **Server isolation.** Server work (processing, insights, timeline) runs in
   Edge Functions with the **service role**, which bypasses RLS but **not**
   triggers or constraints — immutability and provenance rules still apply to
   server code. The service-role key never exists in the app.
   `private.is_app_request()` (JWT role `authenticated`/`anon`) is how triggers
   distinguish app calls from server calls.
5. **`anon` gets nothing.** Signed-out callers can't read or write any table.
6. **Internal functions** live in `private` (not exposed by the API, no
   `EXECUTE` for app roles). The only app-callable function is
   `public.get_health_summary()`, which runs as the caller (RLS applies).
7. **Views** use `security_invoker = true`, so they apply the caller's RLS.

## Matrix — `authenticated` (the app)

S = SELECT, I = INSERT, U = UPDATE, D = DELETE. "—" = not allowed.

| Table | S | I | U | D | Notes |
|---|---|---|---|---|---|
| profiles | own | — (trigger) | own: `display_name`, `onboarding_completed_at` | — | deleted with the account |
| health_profiles | own | own | own: 4 baseline fields | — | clear by setting null |
| documents | own | own: 4 fields (DB sets owner/path/status) | own: `status` **only** `pending_upload → uploaded`, only if the file exists | own **abandoned** uploads only | originals = evidence |
| document_status_history | own | — | — | — | trigger-written |
| document_pages | own | — | — | — | server-written |
| extraction_runs | own | — | — | — | server-written |
| encounters / observations / conditions / medications / procedures / allergies | own | own, `origin` = user_entered / user_corrected only | own: `review_status` only (not on superseded rows) | — | corrections = new row |
| health_events | own | — | — | — | derived |
| insights | own | — | own: `dismissed_at` only | — | |
| insight_sources | own | — | — | — | append-only |
| consents | own | own: type, version, granted | — | — | append-only ledger |
| audit_logs | own | — | — | — | append-only |
| whatsapp_connections *(design)* | own | — | — | — | Edge Function writes |
| notifications *(design)* | own | — | own: `read_at` | — | |

## Matrix — service role (server code)

| Table | Allowed | Still blocked by triggers/constraints |
|---|---|---|
| documents | lifecycle moves in order; set derived metadata | changing owner/path/filename/type/size identity; skipping lifecycle steps; changing `content_sha256`/`page_count` once set |
| clinical facts | insert `extracted` (must carry full evidence); refine interpretation columns | editing any as-written/evidence column; un-superseding |
| insights | insert (must cite sources at commit); supersede | editing text |
| insight_sources, consents, audit_logs | insert | update/delete |

## Storage policies

| Bucket | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `medical-documents` | own folder | own folder, exact path of own `pending_upload` document | **none** (immutable) | own folder, only files with no confirmed document |
| `document-derivatives` *(proposed)* | own folder | — (server) | — | — |
| `generated-artifacts` *(design)* | own folder | — (server) | — | — (server lifecycle) |

Folder = first path segment = `auth.uid()`. Viewing uses 60-second signed URLs.

## How it is verified

- `supabase/tests/security_isolation_test.sql` — Phase 1 (50 checks). Safe to
  run in the Supabase SQL Editor (rolls back).
- `supabase/tests/proposed_health_model_test.sql` — proposed model (85 checks):
  two users, anon and service role; provenance, immutability, correction
  chain, grounding, isolation, account deletion.
- `supabase/tests/local/run-local.sh [--with-proposed]` runs both against a
  throwaway local PostgreSQL.

Any new table must ship with: RLS enabled, explicit revoke/grant, an own-row
policy per allowed command, same-owner composite FKs, and new cases in the
test file.
