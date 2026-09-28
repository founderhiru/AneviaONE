# Mobile Foundation Plan

## 1. Existing state

`founderhiru/health-intelligence-app` was created empty for this project (previously only a `README.md`). There is no existing mobile app, no existing Expo/React Native version, no `package.json`, no navigation, no auth code, and no Supabase configuration to inspect or preserve. This is a greenfield build — nothing here needs to be migrated or reconciled with prior work.

This is a **new, standalone product** — a Personal Health Intelligence app — deliberately separate from the founder's other repository (MedhaIQ, a career-intelligence product). No code, branding, or dependencies are shared between the two.

## 2. Proposed architecture

- **Framework:** Expo (managed workflow) + React Native + TypeScript, using **Expo Router** for file-based navigation.
- **Navigation shape:** `app/(auth)/...` for pre-login screens, `app/(tabs)/...` for the 5 primary tabs, plus top-level stacks for `add/`, `documents/`, `changes/`, `trends/`, `medications/`, `doctor-brief/`, `privacy/`, and `whatsapp/`.
- **Design system:** token files (`colors`, `typography`, `spacing`, `radius`, `shadows`) plus a `theme.ts` aggregator and a `components.ts` re-export, consumed by a reusable component library — no screen hard-codes colors or spacing.
- **Brand neutrality:** a single `config/brand.ts` is the only place the product name/tagline live. No logo asset; a text placeholder stands in for the wordmark.
- **State/data:** a centralized, typed `mock/` data layer feeds all screens during this phase. No screen inlines medical values.
- **Service boundaries:** `services/{auth,health,documents,ai,whatsapp,profile}` — each exposes a typed interface; screens call services, never Supabase (or any provider) directly. This lets mock implementations be swapped for real ones later without touching UI.
- **Auth:** Mobile OTP is the primary path, Google OAuth the secondary path, both modeled as going through Supabase Auth (`services/auth/authService.ts`), with an account-linking strategy documented in `docs/MOBILE_AUTH.md` so one user can hold both an OTP-based and Google-based identity without duplicate accounts.
- **WhatsApp:** UX + `services/whatsapp/` abstraction only. No production WhatsApp Business API calls. Architecture documented in `docs/WHATSAPP_ARCHITECTURE.md` so real credentials can be plugged in later without redesigning the app.
- **AI:** `services/ai/` abstraction only (no live provider call), so a future AI backend sits behind one seam.

## 3. Files that will be created

```
mobile/
├── app.json, package.json, tsconfig.json, babel.config.js, .eslintrc.js
├── app/
│   ├── _layout.tsx
│   ├── (auth)/  welcome, login (mobile+google), otp, onboarding (4 screens)
│   ├── (tabs)/  home, timeline, health, ask, me  (+ tab _layout)
│   ├── add/            (add record → processing → updated)
│   ├── documents/[id]  (document viewer)
│   ├── changes/        (what changed, event detail)
│   ├── trends/[metric] (trend detail)
│   ├── medications/, doctor-brief/, privacy/, whatsapp/, family/
├── components/  (Button, TextInput, OtpInput, Card, HealthChangeCard, TrendCard,
│                 TimelineEvent, EvidenceLink, DocumentCard, EmptyState, LoadingState,
│                 ProcessingState, BottomSheet, Modal, Avatar, StatusBadge, SectionHeader)
├── config/brand.ts
├── design/  (colors, typography, spacing, radius, shadows, components, theme)
├── services/  (auth, health, documents, ai, whatsapp, profile)
├── hooks/
├── mock/  (healthMemory, timeline, observations, medications, changes, conversations, documents)
├── types/
└── __tests__/
docs/
├── MOBILE_FOUNDATION_PLAN.md (this file)
├── MOBILE_ARCHITECTURE.md
├── MOBILE_DESIGN_RULES.md
├── MOBILE_NAVIGATION.md
├── MOBILE_AUTH.md
└── WHATSAPP_ARCHITECTURE.md
```

## 4. Files that will be modified

None yet — greenfield. Future phases (WhatsApp Business credentials, real Supabase project, real AI provider) will modify `services/*` implementations and `.env` handling without touching screens/components, by design.

## 5. Dependencies required

- `expo`, `expo-router`, `expo-status-bar`, `expo-constants`, `expo-linking`, `expo-secure-store`, `expo-image-picker`, `expo-camera`, `expo-document-picker`, `expo-auth-session`, `expo-web-browser`
- `react`, `react-native`, `react-native-safe-area-context`, `react-native-screens`, `react-native-gesture-handler`, `react-native-reanimated`
- `@supabase/supabase-js`
- `typescript`, `@types/react`
- `jest`, `jest-expo`, `@testing-library/react-native`, `@testing-library/jest-native`
- `eslint`, `eslint-config-expo`

## 6. Risks

- **Scope size:** this spec covers ~40 requirement sections. Mitigated by building in the phase order the founder specified (App shell → Auth → Onboarding → Home → Health Memory → What Changed → Timeline → Health/Trends → Ask → Add Record → Me → WhatsApp → polish), landing an MVP 11-screen loop first.
- **No physical device/simulator in this environment:** the app will be verified via `npx tsc --noEmit`, `expo-doctor`/config checks, `npm test`, and `npx expo export` (bundling both platforms) rather than a live simulator. iOS/Android manual-testing instructions are provided for the founder to run via Expo Go.
- **Supabase/Google/WhatsApp credentials are not available:** all three are built as complete UI + service abstractions with a documented configuration seam, never faked as working in "production" code paths (mock mode is isolated behind the mock service implementations, swappable via a single provider flag).

## 7. Decisions

- Mobile OTP is the default/primary auth entry; Google is offered as a secondary option (per founder direction).
- WhatsApp is **not** a day-one production integration — full UX + service abstraction now, real Meta/WhatsApp Business API plugged in later without redesign.
- Reduced MVP screen set for the first working loop: Welcome → Sign up (OTP/Google) → Onboarding → Home → What Changed → Timeline → Ask → Evidence, Home → Health → Trend, Home → Add Record → Processing → Updated, Home → Me → Privacy. Family, ABDM, Doctor Brief, and advanced medication management get route placeholders only, not full builds.
- Brand name stays neutral (`Health Intelligence` / `Your Health`) everywhere, sourced from one config file.
