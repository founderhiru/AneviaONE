# Supabase setup — founder guide

Do these steps **only when you are ready to create the Supabase project**.
Nothing in the repository creates accounts, projects or credentials for you.
Budget ~30–40 minutes.

## 0. Before you start

- [ ] Use a build that includes the mobile Phase 1 integration
      (`docs/MOBILE_PHASE1_INTEGRATION.md`): email sign-in, encrypted session,
      real private uploads, explicit demo/production modes.
- [ ] Review the decisions listed in "Decisions" at the end of this file.
- [ ] You will need: a password manager, access to your email inbox.
- [ ] You will **never** need the **service_role / secret** key for these
      steps. Never paste it into the `mobile/` folder or share it in chat.

What the repository already contains:

| What | Where |
|---|---|
| Phase 1 tables, security rules, private bucket | `supabase/migrations/` (3 files) |
| Proposed health data model (needs approval) | `supabase/migrations_proposed/` (4 files) |
| Security tests (safe; roll back) | `supabase/tests/security_isolation_test.sql`, `supabase/tests/proposed_health_model_test.sql` |
| Local test runner (no Supabase needed) | `supabase/tests/local/run-local.sh [--with-proposed]` |
| App configuration template | `mobile/.env.example` |

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and sign in.
2. Click **New project**.
3. Name: `health-intelligence-app` (a technical name — not the consumer brand).
4. **Database password:** click *Generate a password* and save it in your
   password manager. (Not needed by the app.)
5. **Region:** choose **South Asia (Mumbai)** so Indian users' health data is
   stored in India.
6. Click **Create new project** and wait until it says it's ready.

## 2. Create the database tables and security rules (Phase 1)

**Option A — Supabase CLI (recommended; keeps a migration history).**
In Terminal, from the repository folder (`health-intelligence-app-main`):

```bash
npx supabase login                       # opens a browser to approve
npx supabase link --project-ref <REF>    # REF = the id in your dashboard URL:
                                         # supabase.com/dashboard/project/<REF>
npx supabase db push                     # applies supabase/migrations/*
```

When `link` asks for the database password, use the one from step 1.4.

**Option B — no Terminal.** In the dashboard: **SQL Editor → New query**.
Paste the full contents of each file below, one at a time **in this order**,
and click **Run** after each (each should say *Success*):

1. `supabase/migrations/20260929120000_profiles.sql`
2. `supabase/migrations/20260929120100_documents.sql`
3. `supabase/migrations/20260929120200_document_storage.sql`

## 3. Prove the security rules work

1. **SQL Editor → New query**.
2. Paste the full contents of `supabase/tests/security_isolation_test.sql`.
3. Click **Run**.
4. At the bottom of the output you must see
   **`ALL SECURITY CHECKS PASSED`**. It creates two test users, tries to read
   and change each other's documents, and then **undoes everything** — nothing
   is left behind.
5. If you see an error starting with `FAIL`, stop and send it to engineering.

Also check: **Storage** → the bucket `medical-documents` shows as
**Private** (not Public).

## 4. Turn on email sign-in with a 6-digit code

1. **Authentication → Sign In / Providers → Email**: make sure **Email** is
   enabled. Set **Email OTP Length** to **6**. Click **Save**.
2. **Authentication → Emails → Templates → Magic Link**. Replace the message
   body with the text below (it must contain `{{ .Token }}` — that is the code
   people type into the app). Click **Save**.

   ```html
   <h2>Your sign-in code</h2>
   <p>Enter this code in the app to sign in:</p>
   <p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
   <p>It expires shortly. If you didn't request it, you can ignore this email.</p>
   ```

   (Do the same for the **Confirm signup** template so brand-new users also
   receive a code rather than a link.)

3. **Before real users:** Supabase's built-in email sender only allows a few
   emails per hour and is for testing. Go to **Authentication → Emails → SMTP
   Settings**, enable **Custom SMTP**, and enter the details from an email
   provider (e.g. Resend, Postmark, Amazon SES).

## 5. Connect the app

1. **Project Settings → Data API**: copy the **Project URL**.
2. **Project Settings → API Keys**: copy the **Publishable key**
   (`sb_publishable_…`; on older projects, the **anon public** key).
   Do **not** copy the secret / service_role key.
3. Create `mobile/.env` (copy `mobile/.env.example`; it is git-ignored) and set:

   ```
   EXPO_PUBLIC_APP_MODE=production
   EXPO_PUBLIC_SUPABASE_URL=<Project URL>
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<Publishable key>
   ```

4. Restart the app server with a clean cache: `cd mobile && npx expo start -c`.
   No **DEMO** badge = you are on the real backend. If you see
   "AneviaOne isn’t configured", a value is missing.

## 6. Try the real flow

1. In the app: **Continue with Email** → enter your email → type the 6-digit
   code from the email.
2. Finish onboarding → **Add** → **Upload document** → pick a PDF.
3. You should see **Stored securely**. Tap **View document** →
   **View Original** opens your PDF.
4. Home, Timeline and Health show an empty history (reports aren’t read until
   Phase 2) — that is expected; no sample data is shown in production.
5. In the dashboard: **Table Editor → documents** shows one row with status
   `uploaded`; **Storage → medical-documents** shows
   `<your-user-id>/documents/<document-id>/original.pdf`.
6. Close and reopen the app — you should still be signed in.

## Optional, later

- **Mobile number (SMS) sign-in:** needs an SMS provider (Authentication →
  Sign In / Providers → Phone; e.g. Twilio or MSG91). Sending SMS in India also
  requires DLT registration of your sender ID and template. Until then the app
  tells people to use email.
- **Google sign-in:** needs Google Cloud OAuth credentials and
  `healthintelligence://` added under **Authentication → URL Configuration →
  Redirect URLs**. For linking Google to an existing account, also enable
  **Manual linking** (Authentication → Sign In / Providers).

## 7. Later: apply the health data model (after approval)

When the proposed model (`DATABASE_SCHEMA.md`) is approved, engineering moves
the four files from `supabase/migrations_proposed/` into `supabase/migrations/`
(keeping their names/order) and re-runs `supabase/tests/local/run-local.sh`.
Then either run `npx supabase db push`, or paste each new file into the SQL
Editor in order. Finally paste `supabase/tests/proposed_health_model_test.sql`
into the SQL Editor — it must end with **`ALL HEALTH MODEL CHECKS PASSED`**.

## Decisions

See the "Architectural decisions" section of the Backend Readiness report /
`DATABASE_SCHEMA.md`. The ones that affect setup:

1. **Region** — Mumbai (data stays in India). Changing region later means
   creating a new project and migrating data.
2. **Email sender** — which provider for custom SMTP (Resend, Postmark, SES…).
3. **Whether to apply the proposed health data model** now or at Phase 2.
