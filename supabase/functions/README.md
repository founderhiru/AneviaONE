# Supabase Edge Functions (server-side code)

| Function | Gate | Reads as | AI |
|---|---|---|---|
| `process-document` | 1 — Understand | service role (engine_* functions only), after verifying the caller's JWT and ownership | Anthropic, with consent |
| `health-memory` | 2 — Remember & compare | the caller (anon key + JWT → RLS) | none — deterministic |
| `ask-health` | 3 — Ask | the caller (anon key + JWT → RLS) | Anthropic for wording, with consent; record-built answers otherwise |

## `health-memory` — Gate 2

`POST {}` → `{ memory, timeline, trends, changes }`, all derived deterministically
from the `current_*` views (trusted facts only) in `_shared/health-memory/`:
trends per name **and** unit (no conversion; "varied" unless every step agrees;
one point = insufficient data), timeline per report (undated last, never
invented), What Changed = latest dated report vs earlier records (neutral
sentences, every change cites its records).

## `ask-health` — Gate 3

`POST { question }` → `{ status, answer, sentences[{text, citations}], sources[], generatedBy }`.
Safety screen (diagnosis / treatment / emergency → fixed limitation, nothing read)
→ deterministic intent → minimal retrieval as the caller → record-built answer
→ (with AI consent) the model rewords ONLY the numbered items → every sentence
must cite real items and contain no number/month/judgement the items don't
support, else the record-built answer is returned. Nothing is written.


## `process-document` — Gate 1 document understanding

Turns a stored, text-layer PDF into evidence-backed health facts:

```
app: POST /functions/v1/process-document { document_id }   (user JWT)
  → verify JWT (user id comes ONLY from the token) → ownership → eligibility
  → consent check (ai_processing + health_data_processing at AI_CONSENT_VERSION)
  → atomic claim (engine_claim_document) → 202, work continues in background
  → download original from private `medical-documents` → SHA-256 (write-once)
  → page text via unpdf (text layer only; scanned/image-only → unsupported, no AI call)
  → consent re-checked → deterministic chunks (whole pages, ≤ 60k chars)
  → Anthropic structured output (page TEXT only) → strict schema check
  → deterministic validation: quote on page, value in quote, dates/units/ranges
  → normalization (raw kept; no unit conversion) → confidence gate
  → report-person check (mismatch → review, nothing ingested)
  → one atomic write (engine_complete_document) → document completed
  any failure → transient | provider | validation | unsupported | identity_mismatch | consent_required
```

Code layout:

| Path | What |
|---|---|
| `process-document/index.ts` | Wiring only (env, clients, `Deno.serve`) |
| `_shared/health-engine/handler.ts` | HTTP contract (401/400/404/409/412/200/202) |
| `_shared/health-engine/pipeline.ts` | Steps after the claim |
| `_shared/health-engine/pages.ts` | `PageTextProvider` (unpdf), `OcrProvider` interface (not implemented) |
| `_shared/health-engine/extractor.ts` | `StructuredExtractor` + Anthropic implementation |
| `_shared/health-engine/validate.ts`, `normalize.ts` | Deterministic evidence checks and normalization |
| `_shared/health-engine/identity.ts` | Report-person check |
| `_shared/health-engine/fingerprint.ts` | SHA-256 and fact fingerprints (idempotency) |
| `_shared/health-engine/log.ts` | Allow-listed, redacted logging |
| `_shared/health-engine/tests/` | Deno tests with synthetic PDFs and fakes (no network) |

Database side: `supabase/migrations/20261006120000_gate1_document_understanding.sql`
(service-role-only `engine_*` functions), tested by
`supabase/tests/gate1_engine_test.sql` (run via `supabase/tests/local/run-local.sh`).

### Test locally

```
cd supabase/functions
deno task check     # type-check
deno task test      # unit + pipeline tests (synthetic PDFs, fake provider)
```

### Deploy (requires the project owner — not done by the assistant)

```
# 1. Apply migrations (review `npx supabase db push --dry-run` first)
npx supabase link --project-ref pwohtsjxrpzxhkqrxhmu
npx supabase db push --dry-run
npx supabase db push

# 2. Secrets (never in the app, never in git, never on a command line)
#    Set ANTHROPIC_API_KEY in the dashboard: Project → Edge Functions → Secrets.
#    Non-secret settings can be set from the CLI:
npx supabase secrets set ANTHROPIC_MODEL=claude-opus-5-5 AI_CONSENT_VERSION=ai-2026-10
# optional: keep inference in the US (1.1× price)
# npx supabase secrets set ANTHROPIC_INFERENCE_GEO=us
# verify (names + SHA-256 digests only, never values)
npx supabase secrets list

# 3. Deploy the functions
npx supabase functions deploy process-document health-memory ask-health --import-map supabase/functions/deno.json
```

`AI_CONSENT_VERSION` must equal `AI_CONSENT_VERSION` in
`mobile/services/consent/consentService.ts`. Changing the consent wording
means bumping both — older consents then stop counting.

**Do not send real user health documents through this function until the
provider/data-flow gate has passed** — see `docs/AI_DATA_FLOW.md`.

## Provider configuration

All provider access goes through `_shared/ai/provider.ts` — the only module
that imports the Anthropic SDK or reads `ANTHROPIC_*`. `providerFromEnv()`
builds the provider from Edge Function secrets:

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | server-side secret only |
| `ANTHROPIC_MODEL` | yes | no default in code, e.g. `claude-opus-5-5` |
| `ANTHROPIC_INFERENCE_GEO` | no | `us` or `global` |
| `ANTHROPIC_TIMEOUT_MS` | no | per-attempt client timeout (SDK default otherwise) |
| `ANTHROPIC_MAX_RETRIES` | no | SDK retries for 408/409/429/5xx (default 2) |

If a required variable is missing, the functions still boot: process-document
fails each document as `provider_not_configured`, and ask-health falls back
to record-built answers. Both log the missing variable names at startup.

Provider failures are recorded as `extraction_runs.error_code`:

| Code | Meaning | App sees |
|---|---|---|
| `provider_not_configured` | key or model secret missing | "temporarily unavailable" |
| `provider_auth` | 401: key invalid, revoked or mistyped | "temporarily unavailable" |
| `provider_permission_denied` | 403: key not allowed for this request | "temporarily unavailable" |
| `provider_billing` | 402: account billing problem | "temporarily unavailable" |
| `provider_model_unavailable` | 404: `ANTHROPIC_MODEL` unknown or not enabled | "temporarily unavailable" |
| `provider_bad_request` | 400/413/422: request rejected | "try again" |
| `provider_rate_limited` | 429 | "try again" |
| `provider_unavailable` | 5xx / 529 overloaded | "try again" |
| `provider_timeout` / `provider_connection` | no response / network | "try again" |

The function logs (Dashboard → Edge Functions → process-document → Logs) also
show `http_status`, `provider_error_type`, `provider_request_id` and
`provider_error_message` (truncated to 200 characters, key-shaped text
redacted) for each failure. These are server-side only: never stored in the
database or returned to the app. Keys, prompts, model output and stack traces
are never logged.

The extraction schema has no nullable unions: "not stated" is an empty string
(or `not_stated` for medication status), mapped back to null by `validate.ts`.
Nullable `anyOf` fields made the provider's compiled grammar too large
(HTTP 400 "The compiled grammar is too large"); a test keeps them out.

## Secrets rule

AI provider keys and the Supabase **service-role** key are set ONLY as Edge
Function secrets. They must never appear in `mobile/`, in any `EXPO_PUBLIC_*`
variable, or in the app bundle (enforced by
`mobile/__tests__/demo-production-separation.test.ts`).
