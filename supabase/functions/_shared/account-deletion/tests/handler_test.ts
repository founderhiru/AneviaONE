import { assertEquals } from '@std/assert';

import { createDeleteAccountHandler, lastSignInFromJwt, REAUTH_WINDOW_S, type AccountDeletionDeps, type BeginResult } from '../handler.ts';

const USER = '0f0e0d0c-0b0a-4908-8706-050403020100';
const NOW = 1_800_000_000_000;
const RECENT = NOW / 1000 - 60;

type Fake = { calls: string[]; objects: number; deps: AccountDeletionDeps; logs: Record<string, unknown>[] };

function fake(opts: {
  user?: { userId: string; lastSignInAt: number | null } | null;
  begin?: BeginResult | 'throw';
  objects?: number;
  removeFails?: boolean;
  leaveBehind?: number;
  deleteFails?: boolean;
} = {}): Fake {
  const f: Fake = { calls: [], objects: opts.objects ?? 3, logs: [], deps: undefined as never };
  f.deps = {
    now: () => NOW,
    log: { info: (x) => f.logs.push(x), error: (x) => f.logs.push(x) },
    auth: {
      authenticate: async () => (opts.user === undefined ? { userId: USER, lastSignInAt: RECENT } : opts.user),
      deleteUser: async (id) => {
        f.calls.push(`deleteUser:${id}`);
        if (opts.deleteFails) throw new Error('boom');
      },
    },
    db: {
      begin: async (id) => {
        f.calls.push(`begin:${id}`);
        if (opts.begin === 'throw') throw new Error('db');
        return opts.begin ?? { status: 'deleting' };
      },
    },
    storage: {
      removeAllUnder: async (id) => {
        f.calls.push(`remove:${id}`);
        if (opts.removeFails) throw new Error('storage');
        const n = f.objects;
        f.objects = opts.leaveBehind ?? 0;
        return n;
      },
      countUnder: async (id) => {
        f.calls.push(`count:${id}`);
        return f.objects;
      },
    },
  };
  return f;
}

const post = (body: unknown, auth = 'Bearer token') =>
  new Request('http://x/delete-account', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const call = async (f: Fake, req: Request) => {
  const res = await createDeleteAccountHandler(f.deps)(req);
  return { status: res.status, body: await res.json() };
};

Deno.test('success: begin → remove every file → prove empty → delete the user, in that order', async () => {
  const f = fake();
  assertEquals(await call(f, post({ confirm: 'DELETE' })), { status: 200, body: { status: 'deleted' } });
  assertEquals(f.calls, [`begin:${USER}`, `remove:${USER}`, `count:${USER}`, `deleteUser:${USER}`]);
});

Deno.test('the person deleted is always the caller — a user id in the body is ignored', async () => {
  const f = fake();
  await call(f, post({ confirm: 'DELETE', user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
  assertEquals(f.calls.every((c) => c.endsWith(USER)), true);
});

Deno.test('401 without a valid token; nothing happens', async () => {
  for (const req of [post({ confirm: 'DELETE' }, ''), post({ confirm: 'DELETE' }, 'Basic x')]) {
    const f = fake();
    assertEquals((await call(f, req)).status, 401);
    assertEquals(f.calls, []);
  }
  const f = fake({ user: null });
  assertEquals((await call(f, post({ confirm: 'DELETE' }))).status, 401);
  assertEquals(f.calls, []);
});

Deno.test('400 unless the body confirms with exactly "DELETE"; nothing happens', async () => {
  for (const body of [{}, { confirm: 'delete' }, { confirm: true }, null]) {
    const f = fake();
    assertEquals((await call(f, post(body))).status, 400);
    assertEquals(f.calls, []);
  }
});

Deno.test('405 for anything but POST', async () => {
  const f = fake();
  assertEquals((await createDeleteAccountHandler(f.deps)(new Request('http://x', { method: 'GET' }))).status, 405);
});

Deno.test('403 reauthentication_required when the last sign-in is too old or unknown; nothing happens', async () => {
  for (const lastSignInAt of [NOW / 1000 - REAUTH_WINDOW_S - 1, null]) {
    const f = fake({ user: { userId: USER, lastSignInAt } });
    assertEquals(await call(f, post({ confirm: 'DELETE' })), { status: 403, body: { error: 'reauthentication_required' } });
    assertEquals(f.calls, []);
  }
});

Deno.test('409 while a report is being read: no file and no user is touched', async () => {
  const f = fake({ begin: { status: 'busy' } });
  assertEquals(await call(f, post({ confirm: 'DELETE' })), { status: 409, body: { error: 'account_busy' } });
  assertEquals(f.calls, [`begin:${USER}`]);
});

Deno.test('storage failure: 502, still deleting, the user is NOT deleted (no orphaned files)', async () => {
  const f = fake({ removeFails: true });
  assertEquals(await call(f, post({ confirm: 'DELETE' })), { status: 502, body: { error: 'storage_delete_failed', status: 'deleting' } });
  assertEquals(f.calls.includes(`deleteUser:${USER}`), false);
});

Deno.test('files still listed after removal: 502, the user is NOT deleted', async () => {
  const f = fake({ leaveBehind: 1 });
  assertEquals((await call(f, post({ confirm: 'DELETE' }))).status, 502);
  assertEquals(f.calls.includes(`deleteUser:${USER}`), false);
});

Deno.test('user deletion failure: 500, still deleting — and a retry resumes to success', async () => {
  const f = fake({ deleteFails: true });
  assertEquals(await call(f, post({ confirm: 'DELETE' })), { status: 500, body: { error: 'delete_failed', status: 'deleting' } });
  const retry = fake({ objects: 0 });
  assertEquals((await call(retry, post({ confirm: 'DELETE' }))).status, 200);
  assertEquals(retry.calls, [`begin:${USER}`, `remove:${USER}`, `count:${USER}`, `deleteUser:${USER}`]);
});

Deno.test('begin failure: 500, nothing else touched', async () => {
  const f = fake({ begin: 'throw' });
  assertEquals((await call(f, post({ confirm: 'DELETE' }))).status, 500);
  assertEquals(f.calls, [`begin:${USER}`]);
});

Deno.test('logs carry codes and counts only — never the user id', async () => {
  const f = fake();
  await call(f, post({ confirm: 'DELETE' }));
  assertEquals(JSON.stringify(f.logs).includes(USER), false);
});

Deno.test('lastSignInFromJwt reads the newest amr timestamp; anything malformed is null', () => {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = (claims: unknown) => `${enc({ alg: 'HS256' })}.${enc(claims)}.sig`;
  assertEquals(lastSignInFromJwt(jwt({ amr: [{ method: 'otp', timestamp: 100 }, { method: 'oauth', timestamp: 250 }] })), 250);
  assertEquals(lastSignInFromJwt(jwt({ sub: 'x' })), null);
  assertEquals(lastSignInFromJwt('not-a-jwt'), null);
});
