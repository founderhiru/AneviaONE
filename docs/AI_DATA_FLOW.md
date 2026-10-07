# AI data flow — report reading (Gate 1) and Ask My Health (Gate 3)

Status: **implementation-complete, deployment-unverified.** The provider/data-flow
gate has **not** passed. Do not send real user health documents to the AI
provider until the open items below are resolved and signed off.

This document makes no claim of HIPAA, GDPR, SOC 2 or any other compliance
certification.

## What leaves our infrastructure

| Sent to Anthropic (Messages API) | Never sent |
|---|---|
| Extracted **text** of the pages in one chunk, wrapped in `<page number="N">` tags | The PDF file of a report that has a text layer |
| **Scanned / photographed reports only** (no text layer): the original PDF, once, as a `document` block, to be transcribed verbatim (`ocr.ts`, `OCR_PROMPT_VERSION`); the transcription is then sent as page text like any other report | Images of any report that has a text layer |
| A fixed system prompt (`extractor.ts`, `PROMPT_VERSION`) | The person's account data (name, DOB, email, phone, user id) |
| A JSON schema with field names and generic examples only (no patient data) | Other documents or existing Health Memory |
| Model / effort / max_tokens settings | Supabase keys, JWTs |

Notes:
- Scans (camera captures, image-only PDFs) need the consent version that
  names page images (`ai-2026-11`: "its text, or — for photos and scans —
  images of its pages"). The transcription is stored as the page text with
  `text_source = 'ocr'`; every fact must still quote it, anything marked
  `[illegible]` is rejected, and facts on a page with legibility below 0.85
  are held for review. Scans over 22 MB or 20 pages are refused before any
  AI call.
- Report text itself can contain identifiers printed on the report (name, DOB,
  lab ids). We send the page text as printed; we do not redact it, because the
  report-person check depends on it. This is a decision for the data-flow gate.
- Chunking is deterministic: whole pages, at most 60,000 characters per
  request, at most 40 pages per document; nothing is truncated or dropped
  (over-limit documents fail as `unsupported`).
- No tools, files API, server-side fallbacks, batch or beta features are used.
- `inference_geo` is sent only if `ANTHROPIC_INFERENCE_GEO` is set (`us` or
  `global`). There is no India/Asia option. Default: unset (workspace default).
- The model is whatever `ANTHROPIC_MODEL` names (a server-side secret); the
  code has no default model. The API key exists only as the Edge Function
  secret `ANTHROPIC_API_KEY` and is read only by `_shared/ai/provider.ts`.
  The path is always app → Supabase Edge Function → Anthropic; the app never
  calls the provider and holds no provider credential.

## Ask My Health (Gate 3) — what is sent

Only with both AI consents recorded at the current version. Otherwise the
answer is built from records on the server and nothing is sent.

| Sent | Never sent |
|---|---|
| The question text | Verbatim report quotes, file names, account data |
| For questions the deterministic classifier can't route: the question only (to pick an intent) | Records unrelated to the question (retrieval is per intent; e.g. a medication question loads only medications) |
| Up to ~80 numbered items: test/medication/condition names, values, units, dates, "report dated X, page N", and deterministic trend/change sentences | Another person's records (all reads run as the caller under RLS) |

The model only rewords. Its answer is used only if every sentence cites
retrieved items and contains no number, month or judgement those items don't
support; otherwise the record-built answer is shown. Diagnosis, treatment and
emergency questions are answered with a fixed limitation before any record is
read. Questions are not logged.

## Gate 2 is deterministic

Health Memory, Timeline, Trends and What Changed are computed in
`supabase/functions/_shared/health-memory/` from the `current_*` views, with no
AI. The proposed `timeline_insights` migration (persisted `health_events` and
`insights`) is **not applied**: V1 derives these on read from trusted facts, so
they can never go stale after reprocessing or review, and there is no second
copy of health data to secure. It stays proposed for when stored, reviewable
insights are needed.

## Provider terms — verified from official Anthropic sources

| Fact | Source |
|---|---|
| API inputs/outputs are deleted within 30 days by default | Anthropic privacy centre article on API data retention (updated 1 July 2026) |
| Content flagged by trust & safety classifiers may be kept up to 2 years; classifier scores up to 7 years | Same article |
| "Anthropic may not train models on Customer Content from Services" | Commercial Terms of Service (effective 17 June 2025) |
| Customer owns inputs and outputs; the DPA is incorporated into the Commercial Terms | Commercial Terms |
| Zero Data Retention (ZDR) is available by arrangement with Anthropic sales | Anthropic docs |
| HIPAA-eligible use requires a signed BAA; the Messages API, structured outputs, effort and data residency are listed as eligible, beta features generally are not | Anthropic docs (ZDR/HIPAA eligibility) |
| Structured-output schemas may be cached for up to 24 h — so schemas must not contain PHI (ours do not) | Anthropic docs (structured outputs) |

## Not verified / open items (block real data)

1. **No ZDR agreement and no BAA are in place.** Whether either is required
   depends on the users' jurisdiction and our role — legal decision needed.
2. **India DPDP Act 2023** obligations for cross-border transfer and for
   processing health data have not been reviewed.
3. Whether Anthropic's DPA sub-processor list and transfer mechanisms meet our
   needs — not reviewed.
4. Whether report text should be pseudonymised before sending (see note above).
5. Anthropic API key must belong to a workspace with the intended retention /
   geo settings — not configured.

## Consent

- Two explicit consents, recorded together: `health_data_processing` and
  `ai_processing`, versioned (`ai-2026-10`), timestamped (`recorded_at`, set by
  the database), append-only, revocable (a new `granted = false` row).
- The app shows the consent text (`AI_CONSENT_COPY`) before the first read and
  in Privacy → Report reading (AI), where it can be turned off.
- The server checks both consents at `AI_CONSENT_VERSION` **twice**: before
  claiming the document (412, no state change) and again immediately before
  the AI call. Without consent no text is sent.
- Revoking does not delete results already added; it stops new reads.

## Logging

`log.ts` writes only allow-listed keys: ids, statuses, failure kinds, error
codes, counts, durations, model, pipeline version, text-layer and
identity-check outcomes. It never logs PDF text, quotes, values, names,
dates of birth, prompts, model output or tokens (tested in
`pipeline_test.ts` and `units_test.ts`). Provider error messages are not
shown to the app or stored; they are mapped to error codes. For provider
failures the server logs also carry the HTTP status, the provider's error type,
its opaque request id and its message truncated to 200 characters, with
key-shaped text redacted (`provider_test.ts` checks the key never appears).

## Model output is untrusted

Every fact must cite a page and a verbatim quote that is found on that page,
with the value (and unit) inside the quote; dates must appear on the page.
Anything else is rejected. Ambiguous values or dates are kept raw, never
guessed, and held for review. Low-confidence facts (< 0.85) are held for
review and excluded from `current_*` views; < 0.5 are discarded. A family
history is never stored as a diagnosis.
