# Mobile Navigation

Route map and navigation rules for the Expo Router app, per spec section
2/36.

## Route tree

```
/                          index.tsx — loading placeholder; root layout redirects from here

(auth)                     Unauthenticated / pre-onboarding
  /welcome                  Brand name + tagline, "Continue with mobile number" / "Continue with Google"
  /login?method=mobile|google   Mobile OTP entry (default) or Google sign-in UI
  /otp                       6-digit OTP entry, auto-verifies at 6 digits
  /onboarding                4-step intro, ends in "Take a photo" / "Upload a document" / "Skip"

(tabs)                     5 bottom tabs — exactly these 5, no more
  /home                      Home: What Changed preview, Health Story, Trends preview, Ask entry
  /timeline                  Health Timeline, grouped by year
  /health                    Health: Trends, Medications, Conditions, Vitals, Procedures, Allergies, Vaccinations
  /ask                       Ask My Health: suggested questions + conversation
  /me                        Profile, stats, settings rows, sign out

Pushed on top of the tabs (own back button via ScreenHeader)
  /changes                   What Changed (full list)
  /trends/[metric]            Trend detail (chart + history + evidence)
  /timeline/[id]               Timeline event detail
  /documents/[id]               Document viewer
  /add                          Add Record: choose → processing → updated
  /medications                   Full medications list
  /doctor-brief                   Doctor Brief (preview/skeleton only)
  /family                          Family Health (placeholder only)
  /privacy                          Privacy & Security
  /privacy/data-sharing               Data Sharing toggles
  /whatsapp                            Connect WhatsApp
```

## Root redirect logic

`app/_layout.tsx`'s `RootNavigator` is the single place that decides which
stack the person sees, based on `useAuth()`'s `user` and the current
`useSegments()`:

1. No `user` → redirect to `/(auth)/welcome`.
2. `user` present but `user.onboardingComplete` is `false` → redirect to
   `/(auth)/onboarding`.
3. Otherwise → redirect to `/(tabs)/home`.

Screens under `(auth)` never need to check auth state themselves to decide
where to go next — after a successful OTP verify or Google sign-in, they
call `refreshUser()` and let the root redirect take over. The two
exceptions that navigate directly are Onboarding's "Skip" (`goHome`) and
"Take a photo"/"Upload a document" (`goToAdd`) actions, since those are a
person's explicit choice rather than an auth-state change.

## Core loop navigation

The product's core loop (CAPTURE → REMEMBER → COMPARE → UNDERSTAND → ASK →
SHARE) maps onto navigation like this:

```
Home / Timeline ──(Add Record)──▶ /add ──(camera or upload)──▶ processing ──▶ updated
                                                                                  │
                                                          ┌───────────────────────┤
                                                          ▼                       ▼
                                                     /changes            /(tabs)/home
                                              (View What Changed)             (Done)
```

From `/changes` or Home's What-Changed preview, a value change links to
`/trends/[metric]` (with the metric name URL-encoded), and every change
card links to `/documents/[id]` as its evidence. `/(tabs)/ask` is reachable
from Home's "Ask about your health history..." prompt and from evidence
links inside AI answers.

## Tab bar

Exactly 5 tabs, defined in `app/(tabs)/_layout.tsx` with Ionicons: Home,
Timeline, Health, Ask, Me. No additional tabs are added for Family, Doctor
Brief, or WhatsApp — those are reached via `Me`'s row list, consistent with
the reduced-MVP screen set (spec section: "don't build Family, ABDM,
Doctor Brief... before the core loop works").

## Navigating with parameters

- `/login?method=mobile|google` — read via `useLocalSearchParams<{ method?: string }>()`.
- `/otp` — receives `{ mobileNumber }` via `router.push({ pathname: '/(auth)/otp', params: { mobileNumber } })`.
- `/trends/[metric]` — the metric name is URL-encoded on push
  (`encodeURIComponent(metricName)`) and decoded on read
  (`decodeURIComponent(metric)`), since metric names contain spaces (e.g.
  "LDL Cholesterol").
- `/timeline/[id]` and `/documents/[id]` — plain string IDs from the mock
  data layer.

## Testing navigation

Per `MOBILE_ARCHITECTURE.md`'s Testing section, `expo-router` is mocked
globally so `router.push`/`replace`/`back` are inspectable `jest.fn()`s.
Every navigation-triggering interaction in `__tests__/*.test.tsx` asserts
the exact call (pathname + params) rather than relying on a real navigator
transitioning — this is what "verify major navigation paths work" means
for this test suite (see `jest.setup.js` for the rationale on not using
`expo-router/testing-library`'s full-router `renderRouter()` in this
environment).
