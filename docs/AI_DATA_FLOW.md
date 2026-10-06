# AI provider data flow — Gate 1 (document extraction)

**Document version: `ai-data-flow-v1`** · written 2026-10-06 · provider: Anthropic

This is the provider/data-flow gate required before any document is sent to a
third-party AI. It is a description of what the code does and what Anthropic's
public documentation says. It is **not** legal advice and **not** a compliance
claim: AneviaONE makes no HIPAA, GDPR, SOC 2 or other certification claim.

## The gate is enforced in code

`process-document` refuses to call Anthropic unless the Edge Function secret
`AI_DATA_FLOW_APPROVED` equals `ai-data-flow-v1` (the version above). Setting
that secret is the founder's explicit sign-off that this document was read and
accepted. Until it is set, uploads stay safely stored and nothing is sent.

If this document changes materially, bump the version in the document **and**
in `supabase/functions/_shared/config.ts`; the secret must then be re-set.

## What is sent, where, and why

| Question | Answer |
|---|---|
| Is the PDF itself sent? | **No.** The PDF never leaves our server. |
| Are page images sent? | **No.** Gate 1 handles text-layer PDFs only; no rendering or vision. |
| What is sent? | Extracted **page text** only, in deterministic chunks (whole pages, ≤ 24,000 characters per request, at most 40 pages / 8 requests per document), plus a fixed instruction prompt and a JSON schema. |
| Is identity sent? | Report text may contain the patient's name, date of birth and other identifiers because they are in the report text. We do **not** add the account email, user id, profile name or date of birth to the request. The identity comparison runs on our server, after the response. |
| Endpoint | `POST https://api.anthropic.com/v1/messages` (Messages API, tool-use with a forced tool for strict JSON). |
| Model | Configurable secret `ANTHROPIC_MODEL`; default `claude-sonnet-5-5` (listed as a current API model ID in Anthropic's models overview, checked 2026-10-06). |
| Why | To turn report text into structured, evidence-linked facts. The model proposes; our code validates (quote must exist on the page, value must be in the quote, etc.). The model is never the source of truth. |
| Who triggers it | Only the signed-in owner, only after recorded `ai_processing` **and** `health_data_processing` consent (see below). |
| Inference location | Request parameter `inference_geo` from secret `ANTHROPIC_INFERENCE_GEO`, default `"us"`. See "Regions". |

## What Anthropic's documentation says (checked 2026-10-06)

Verified against Anthropic first-party pages:

- **Training.** The Commercial Terms of Service (effective June 17, 2025, per the page) state Anthropic may not train models on Customer Content from the Services. Source: anthropic.com/legal/commercial-terms.
- **Retention (default).** Anthropic's privacy centre (page last updated July 1, 2026) says API inputs and outputs are automatically deleted from Anthropic's backend within 30 days by default, with exceptions: usage-policy violations (inputs/outputs up to 2 years, safety classifier scores up to 7 years), legal requirements, user-controlled longer retention for some services (e.g. Files API — **we do not use the Files API**), and feedback submissions. Source: privacy.claude.com, "How long do you store my organization's data?".
- **Zero data retention (ZDR).** Not automatic. Available to some customers by agreement, per organisation, subject to Anthropic's approval; even then some safety-related retention can remain. Source: privacy.claude.com, ZDR article. **AneviaONE has no ZDR agreement unless the founder obtains one — assume the 30-day default.**
- **Regions.** Per Anthropic's data-residency documentation, `inference_geo` accepts `"us"` or `"global"` (default `"global"`), supported on Claude 4.6-and-later models; US-only inference is priced at 1.1× standard; `workspace_geo` currently only `"us"`. India appears on Anthropic's supported-countries list for API access. The documentation reviewed does **not** say exactly where "global" inference runs.
- **Data processing terms.** The Commercial Terms incorporate the Anthropic Data Processing Addendum by reference. We did not review the DPA text in Gate 1.

## UNVERIFIED — must be confirmed by the founder before real users

1. Whether the founder's own Anthropic organisation has any non-default retention or ZDR setting (check **Settings → Privacy controls → Data retention** in the Anthropic Console).
2. The exact text of the DPA, and whether it is signed/applicable to the AneviaONE account.
3. Where "global" inference physically runs (we default to `us` to be explicit, at the 1.1× price; this is not a claim about adequacy for any law).
4. Whether Indian law (e.g. DPDP Act) requires anything beyond the consent flow below. Not assessed; needs qualified advice.
5. That the `inference_geo` field is accepted for the chosen model on the real account — confirmed only by the real-backend test (Gate 1 §23), which has **not** been run yet.
6. Tool-use request/response field names were taken from stable Messages API conventions (`tool_choice`, `tool_use` content block, `usage.input_tokens/output_tokens`); the tool-use docs page could not be re-fetched during this review. The real-backend test confirms them.

## Consent (required before any provider call)

- Two **separate, explicit** consents, never bundled into terms acceptance:
  `health_data_processing` and `ai_processing`.
- Recorded in the append-only `consents` ledger: user id (from the authenticated session, set by the database), consent type, policy version, granted true/false, timestamp.
- Revoking = a new row with `granted = false`; it applies to future processing. Already-extracted facts remain until the user deletes them (deletion flows are a later phase).
- Existing users with no consent rows are asked before their first processing.
- The server (not the app) checks the latest consent rows with the service role before every provider call. A missing or revoked consent returns `consent_required` and **no provider request is made**.
- Current consent text version: `consent-2026-10-v1` (`supabase/functions/_shared/config.ts`, mirrored in the app).

## What we log / do not log

Logged (structured, redacted): document id, extraction-run id, user-scoped status, error code, timings, page count, chunk count, counts of facts accepted/rejected/needs-review by reason code, provider token counts, model name.

**Never logged:** PDF bytes, page text, source quotes, extracted values, patient name/DOB, prompts, provider responses, API keys, JWTs. Provider error bodies are not logged (only HTTP status and our own error code).

Stored in our database (private, RLS-protected): per-page text (needed for evidence), extracted facts with verbatim source quotes, run metadata (counts, tokens, model, prompt version). The raw provider response is **not** stored in Gate 1.

## Minimum-necessary rules

- Only whole pages that contain text are sent; the model cannot choose pages. Page numbers come from our extractor.
- Chunking is deterministic (see `chunking.ts`).
- Documents already processed are not re-sent: reprocessing requires an explicit request, is rate-limited (max 5 attempts), and permanent failures are not retried.
- No conversation history, no other records, and no account data accompany a request.
