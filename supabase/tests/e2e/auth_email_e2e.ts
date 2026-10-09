/**
 * Live check: the DEPLOYED project can send the email sign-in code.
 *
 * Makes exactly the request the app makes for "Continue with Email"
 * (services/auth/supabaseAuthService.ts sendEmailOtp), for the dedicated test
 * account B only, and reports the server's real status and error code — the
 * app itself only shows "We couldn't send a code right now".
 * Sends ONE code email to the test mailbox (the project allows one a minute).
 *
 *   set -a; source supabase/tests/e2e/.env.e2e; set +a
 *   deno run --allow-net --allow-env supabase/tests/e2e/auth_email_e2e.ts
 *
 * Fails with e.g. 500 unexpected_failure "Error sending magic link email"
 * when the custom SMTP sender can't deliver (unverified sending domain or a
 * wrong SMTP key) — every user's email sign-in is broken in that state.
 */

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Set ${k}`);
  return v;
};
const email = env('E2E_B_EMAIL');
if (!/^[^@\s+]+\+e2e[a-z0-9]*@[^@\s]+$/i.test(email)) {
  console.error('REFUSING TO RUN: E2E_B_EMAIL must be a dedicated "+e2e" test address');
  Deno.exit(2);
}

const url = env('SUPABASE_URL');
const headers = { apikey: env('SUPABASE_ANON_KEY'), 'content-type': 'application/json' };
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!ok) failures += 1;
};

const settings = await (await fetch(`${url}/auth/v1/settings`, { headers })).json();
check('email sign-in is enabled', settings?.external?.email === true);

// Same request as signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo } }).
const res = await fetch(`${url}/auth/v1/otp?redirect_to=${encodeURIComponent('healthintelligence://auth-callback')}`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ email, create_user: true }),
});
const body = await res.json().catch(() => ({}));
check('the sign-in code email is sent (200)', res.status === 200, res.status === 200 ? '' : `${res.status} ${body.error_code ?? ''} ${body.msg ?? ''}`.trim());

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nEMAIL SIGN-IN CODE CAN BE SENT');
Deno.exit(failures ? 1 : 0);
