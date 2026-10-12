# Local AI test key (isolated, budget-limited)

Live-AI tests (report reading, re-reading, Ask) run against the **local** Supabase stack with a **separate** Anthropic key. Never copy the production `ANTHROPIC_API_KEY` from `supabase secrets` or anywhere else.

## 1. Create the key (Anthropic Console)

1. Create a dedicated workspace, e.g. `aneviaone-local-test` (Settings → Workspaces).
2. Set a low monthly **spend limit** on that workspace (e.g. US$10). When it is reached, requests fail; nothing else is affected.
3. Optionally set a low rate limit for the workspace.
4. Create an API key **in that workspace** named `local-test-<your-name>`. Copy it once.

Revoke it when testing is done, or when it may have leaked.

## 2. Configure it locally only

`supabase/functions/.env` is gitignored (`.gitignore`: `.env`). Create it with permissions 600:

```sh
umask 077
cat > supabase/functions/.env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...test-workspace-key...
ANTHROPIC_MODEL=<same model id as production>
AI_CONSENT_VERSION=ai-2026-11
EOF
git check-ignore -v supabase/functions/.env   # must print the .gitignore rule
```

Serve the functions against the local stack only:

```sh
supabase start                                   # local stack (API 127.0.0.1:54321)
supabase functions serve --env-file supabase/functions/.env
```

The app must point at the local stack (`EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the local anon key), and test data must be synthetic.

## 3. Never

- `supabase secrets set` with the test key on the production project, or with the production key locally.
- Commit `.env`, paste the key into issues, PRs, logs or screenshots.
- Upload real reports. Use synthetic PDFs/images only.

## 4. Tests that need it (currently BLOCKED without it)

- Live report reading → Result screen → correct → re-read: the correction stays (the reread is covered without AI by `corrections_local_test.ts`).
- Ask answers use the corrected value, not the original.
