# Supabase Edge Functions (server-side code)

Nothing is deployed from here yet — Phase 1 needs no server code.

This folder is where **Phase 2** document processing will live, e.g.
`supabase/functions/process-document/`:

```
documents.status = 'uploaded'
  → Edge Function (service role) downloads the original from `medical-documents`
  → AI extraction (provider key read from Edge Function secrets)
  → writes structured observations linked to documents.id (+ page evidence)
  → moves the document uploaded → processing → extracted → validated → completed
    (or → failed with a user-safe processing_error)
```

The database already enforces that only server code can make those lifecycle
moves (see `migrations/20260929120100_documents.sql`) and records each one in
`document_status_history`.

## Secrets rule

AI provider keys (OpenAI, Anthropic, …) and the Supabase **service-role** key
are set ONLY as Edge Function secrets:

```
npx supabase secrets set ANTHROPIC_API_KEY=...
```

They must never appear in `mobile/`, in any `EXPO_PUBLIC_*` variable, or in
the app bundle.
