# Supabase Edge Functions (server-side code)

| Function | Purpose |
|---|---|
| `process-document` | Gate 1: reads an uploaded text-layer PDF and stores evidence-linked health facts. |

Layout:

```
functions/
  process-document/   handler.ts (tested, dependency-injected) · index.ts (Deno.serve wiring) · supabaseDb.ts (service-role adapter)
  _shared/            pure TypeScript: validation, normalisation, evidence, identity, confidence, chunking, pipeline
  _shared/providers/  PageTextProvider (unpdf) · OcrProvider (interface only) · StructuredExtractor (Anthropic)
  _fixtures/          SYNTHETIC test PDFs (scripts/make_synthetic_pdfs.py) — no real patient data
```

Tests for all of this run in Jest from `mobile/` (`npm test`), and the
database side is covered by `supabase/tests/local/run-local.sh`.
See `docs/GATE1_DOCUMENT_UNDERSTANDING.md` for the architecture and deploy
commands, and `docs/AI_DATA_FLOW.md` for the provider data-flow gate.

## Secrets rule

The AI provider key and the Supabase **service-role** key exist ONLY as Edge
Function secrets:

```
npx supabase secrets set ANTHROPIC_API_KEY=...
```

They must never appear in `mobile/`, in any `EXPO_PUBLIC_*` variable, or in
git. (`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected into Edge Functions by Supabase automatically.)
