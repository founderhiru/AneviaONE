# Mobile Architecture

This document describes how the `mobile/` Expo app is put together: the
folder layout, the routing shape, the service/repository boundary that
keeps the UI decoupled from any real backend, and the state/data flow
through a typical screen.

## Stack

- Expo SDK 57 (managed workflow), React Native 0.86.3, React 19.2.3, TypeScript (strict).
- Expo Router (file-based routing) for all navigation.
- React Context (`AuthProvider`) for auth/session state.
- No global state library — screens own their own `useState`/`useEffect`
  data loading against a service, which is enough at this skeleton's scope.
- `react-native-svg` for the one piece of custom drawing (trend sparklines
  and the trend-detail chart) — no charting library dependency.
- `expo-secure-store` for the (mock-only) session cache.

## Folder layout

```
mobile/
  app/                  Expo Router routes — one file per screen
    (auth)/              Welcome, Login (mobile OTP + Google), OTP, Onboarding
    (tabs)/              The 5 bottom tabs: Home, Timeline, Health, Ask, Me
    changes/              "What Changed" (spec section 36 core-loop screen)
    trends/[metric]/       Trend detail
    timeline/[id]/          Timeline event detail
    documents/[id]/          Document viewer
    add/                   Add Record (camera / upload / WhatsApp entry)
    medications/            Full medications list
    doctor-brief/            Preview/skeleton only
    family/                  Placeholder only
    privacy/                 Privacy & Security, Data Sharing
    whatsapp/                Connect WhatsApp
    _layout.tsx            Root Stack + providers + auth-based redirect
  components/            Reusable UI primitives (Button, Card, EmptyState, …)
  config/brand.ts         Single source of truth for product naming (see below)
  design/                 Design tokens: colors, typography, spacing, radius, shadows, theme
  hooks/useAuth.tsx        AuthProvider/useAuth() context
  mock/                   Typed, synthetic mock data (never real patient data)
  services/               Service interfaces + mock/real implementations (see below)
  types/                  Domain models shared across the app
  __tests__/              Screen/component tests (see "Testing" below)
```

Non-route code (components, hooks, services, design, mock, types) lives
outside `app/`, so every file under `app/` is a real screen or layout.

## Brand neutrality

`config/brand.ts` is the **only** place the product name, tagline, and
recurring product terms ("Health Memory", "What Changed", "Ask My Health",
etc.) are defined. No screen hard-codes a brand name, and there is no logo
asset — `BRAND.logo` stays `null` and screens render a text wordmark from
`BRAND.name`/`BRAND.shortName` instead. Re-branding the app later means
changing this one file.

## Routing shape

The root `_layout.tsx` renders a single Stack (`headerShown: false`) wrapping
`GestureHandlerRootView > SafeAreaProvider > AuthProvider`. A `RootNavigator`
component watches `useSegments()` + the current `user` from `useAuth()` and
redirects:

- No user → `(auth)/welcome`
- User signed in but `onboardingComplete` is false → `(auth)/onboarding`
- User signed in and onboarded → `(tabs)/home`

Individual screens never need to check auth state themselves — the root
redirect handles it — except where a screen calls `useAuth()` directly for
its own data (e.g. `Me`, `WhatsApp connect`).

Screens outside `(tabs)` (What Changed, Trend detail, Timeline event,
Document viewer, Add Record, Medications, Doctor Brief, Family, Privacy,
Data Sharing, WhatsApp) are pushed on top of the tab navigator and use
`ScreenHeader` for their own back button, since the Stack itself has
`headerShown: false`.

## Service / repository boundary

Every screen depends on a typed **service interface**, never on a backend
SDK directly:

```
services/
  auth/          AuthService        (mock + Supabase implementations)
  health/        HealthService      (mock only for now)
  documents/     DocumentsService   (mock only for now)
  ai/            AiService          (mock only for now)
  whatsapp/      WhatsAppService    (mock only; see WHATSAPP_ARCHITECTURE.md)
  profile/       ProfileService     (mock only for now)
```

Each service module exports a single concrete instance selected by a
config flag, e.g.:

```ts
// services/auth/authService.ts
export const authService: AuthService = isSupabaseConfigured ? supabaseAuthService : mockAuthService;
```

`isSupabaseConfigured` comes from `services/supabaseClient.ts` and is true
only once `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are
set. Everything except auth currently only has a mock implementation — the
interfaces are shaped so a real implementation can be dropped in later
without touching any screen (see MOBILE_AUTH.md and
WHATSAPP_ARCHITECTURE.md for the two seams that matter most).

## Data flow in a typical screen

Screens follow one consistent pattern:

```tsx
const [data, setData] = useState<T | null>(null);
const [error, setError] = useState(false);

async function load() {
  setError(false);
  try {
    setData(await someService.getSomething());
  } catch {
    setError(true);
  }
}

useEffect(() => { load(); }, []);

if (error) return <ErrorState onRetry={load} />;
if (data === null) return <LoadingState label="…" />;
// render `data`
```

This gives every major screen the required Loading / Error / Success
states for free, with Empty and Offline handled per-screen where relevant
(e.g. Timeline's `EmptyState` when there are no records yet).

## Mock data layer

`mock/` holds typed, synthetic, fictional data only — no real patient
data anywhere. It's organized by domain (`documents`, `observations`,
`medications`, `changes`, `timeline`, `healthMemory`, `conversations`) and
re-exported from `mock/index.ts`. Mock service implementations
(`mockAuthService`, `healthService`, etc.) read from here; this is the
layer that gets replaced when real API calls are wired in — the mock data
shapes were designed to match the domain types in `types/` exactly, so
swapping a service's implementation doesn't require reshaping data
consumers.

## Testing

Tests render individual screens directly with
`@testing-library/react-native`, rather than the full Stack/Tabs
navigators — `expo-router` is mocked globally in `jest.setup.js`
(`router.push`/`replace`/`back` are `jest.fn()`s), and navigation is
verified by asserting those calls. `react-native-safe-area-context` is
mocked via its own official Jest mock (also wired in `jest.setup.js`),
which is required — the real `SafeAreaProvider` never resolves under the
Jest test renderer, so without this mock any screen wrapped in it renders
an empty tree. See `__tests__/testUtils.tsx` for the `renderWithProviders`
/ `renderWithAuth` helpers used by every test file.
