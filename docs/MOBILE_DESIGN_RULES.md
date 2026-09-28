# Mobile Design Rules

Design tokens and component rules for the app, per spec section 3 (design
system) and section 4/33 (platform conventions, accessibility), and the
dedicated visual-design pass that followed the functional skeleton.
Everything here lives under `mobile/design/` and `mobile/components/`.

## Product positioning

This is a Personal Health Intelligence product. It should feel calm,
premium, trustworthy, intelligent, personal, private, modern — think
Apple-level simplicity + premium fintech clarity + modern AI-product
intelligence. It must never look like a hospital application, a medical
dashboard, a generic health tracker, a document-storage app, or a generic
AI chatbot. Concretely, that rules out: default-red vitals, traffic-light
health coding, gamified badges/streaks, heavy gradients, and stacking
everything in bordered cards by default.

## Aesthetic principles

Premium, calm, trustworthy, minimal. A warm off-white canvas, deep
navy/ink as the primary text and action color, a restrained blue/teal
accent, whitespace used aggressively instead of dividers/cards. Green,
amber, and red are used only where semantically necessary (destructive
actions, genuine warnings) — never for routine emphasis. Typography leans
editorial rather than dense (see Typography below).

Trend colors (`trendUp` / `trendDown` / `trendFlat`) are intentionally
**not** red/green — an upward trend isn't automatically "bad" and a
downward one isn't automatically "good" outside clinical context the app
doesn't have. See `design/colors.ts`.

## The Health History Line

The product's signature visual motif is a quiet timeline of years joined
by a hairline rule — `2019 ─── 2021 ─── 2023 ─── 2026` — used wherever the
product wants to say "this is about your history over time" without
reaching for a chart or a card. Implemented as `components/HealthHistoryLine.tsx`
and used on Home's "Your Health Story" section (replacing an earlier
card-wrapped row of years). It is deliberately not a `Card` — it's
line-work and typography, not a content surface — which is also an
example of the "avoid excessive cards" rule in practice.

## Tokens

All tokens are consumed through `useTheme()` (`design/theme.ts`), which
picks `lightColors` or `darkColors` (`design/colors.ts`) based on
`useColorScheme()`, and aggregates:

- **Colors** — semantic names only (`background`, `textPrimary`,
  `brandPrimary`, `danger`, …), never raw hex in screens/components.
- **Typography** (`design/typography.ts`) — a fixed scale
  (`displayLarge`/`displayMedium`, `headingLarge/Medium/Small`,
  `bodyLarge/Medium/Small`, `labelLarge/Medium`, `caption`), using the
  system font (San Francisco / Roboto) with subtle negative letter-spacing
  on the display/heading sizes (-0.1 to -0.4) for an editorial rather than
  default-system-dense feel, without pretending a custom display font was
  used.
- **Spacing** (`design/spacing.ts`) — `xxs`/`xs`/`sm`/`md`/`lg`/`xl` scale,
  plus `minTouchTarget = 44` (see Accessibility below).
- **Radius** (`design/radius.ts`) and **Shadows** (`design/shadows.ts`).

Never inline a raw color, font size, or spacing value in a screen —
always go through `theme.*`. This is what makes a future re-skin (once a
final brand palette exists) a change to `design/colors.ts` alone.

## Component library

Reusable primitives live in `components/` and are re-exported from
`components/index.ts`:

`Button`, `SecondaryButton`, `TextInput`, `OtpInput`, `Card`,
`SectionHeader`, `StatusBadge`, `Avatar`, `EvidenceLink`, `DocumentCard`,
`HealthChangeCard`, `HealthHistoryLine`, `TrendCard`, `TimelineEvent`,
`EmptyState`, `LoadingState` (+ `SkeletonBlock`), `ErrorState`,
`ProcessingState`, `Modal`, `BottomSheet`, `ScreenContainer`,
`ScreenHeader`.

Screens compose these rather than rebuilding primitives inline. New
one-off UI should still be built from `theme.*` tokens even when it
doesn't warrant a new shared component.

**Card discipline**: `Card` is for genuine content surfaces (a record, a
trend, a change) — not for every grouping of text on a screen. Where a
section only needs typographic separation (an intro line, a row of years,
an icon + a sentence), render it directly against the background instead
of wrapping it in a bordered `Card`. This pass removed two such cards
(Home's "Your Health Story" row, Privacy's intro line) in favor of plain
layout, per the brief's "avoid excessive cards" rule.

## Required screen states

Every major data-driven screen supports, at minimum:

- **Loading** — `LoadingState` (or a screen-specific skeleton)
- **Empty** — `EmptyState`, with an action where one makes sense (e.g.
  Timeline's "Add Record" when there are no events yet)
- **Error** — `ErrorState` with a retry action wired to the same `load()`
  the screen used initially
- **Success** — the real content

Where relevant (Add Record's camera/upload permission failures, OTP's
incorrect-code case), an inline error message is also shown next to the
control that failed rather than only via a toast, so the state is durable
and testable.

Offline handling in this skeleton is limited to: every network-backed
action is wrapped in try/catch and surfaces `ErrorState`/an inline error
rather than throwing — there's no offline cache/queue yet, which is
appropriate for a UX skeleton but should be revisited before a real
backend replaces the mock services.

## Accessibility

- **Touch targets**: interactive elements meet `theme.minTouchTarget` (44
  logical px) minimum height/width — see `Button`, the Ask screen's send
  button, and `Me`'s row list.
- **Labels**: every icon-only or ambiguous control has an explicit
  `accessibilityLabel` (e.g. Add Record's camera/upload/WhatsApp cards,
  OTP's hidden input, Ask's send button).
- **Roles**: buttons use `accessibilityRole="button"`, screen titles use
  `accessibilityRole="header"`, live error text uses
  `accessibilityLiveRegion="polite"` (Login, OTP, Add Record).
- **No color-only meaning**: `StatusBadge` and error states always pair a
  color with a text label (e.g. "Active"/"Past" for medications, not just
  a colored dot); OTP box borders change color on error but the screen
  also renders the error text itself.

## Responsive layout

No fixed absolute positioning for layout (the one legitimate use is
`OtpInput`'s intentionally invisible/absolutely-positioned hidden text
input, which exists purely to host real keyboard/autofill focus — not for
visual layout). Screens use `SafeAreaView` (via `ScreenContainer`), `flex`,
`ScrollView`, and `FlatList` (Timeline, Ask's message list) so layouts
adapt to device size and orientation rather than assuming a fixed
viewport.

## Screen-by-screen notes from this pass

- **Home** — hierarchy is Greeting → Your Health → What Changed → Your
  Health Story → Health Trends → Ask My Health, in that order, so the
  product reads within a few seconds. "Your Health Story" now renders
  `HealthHistoryLine` instead of a card. The "Ask about your health
  history..." entry point is now a pill (rounded, tinted background, a
  sparkle icon) rather than a bordered card, to read as an intelligent
  entry point rather than another content card.
- **What Changed** (`HealthChangeCard`) — already showed
  `previous → current` with a neutral arrow, a compared-with date, and
  non-alarming trend colors; unchanged in this pass, it already matched
  the brief.
- **Timeline** — unchanged visually this pass; it already uses a rail +
  dot + connecting line per event rather than a flat document list.
- **Health** — unchanged visually; already leads with `TrendCard`
  (sparkline + direction) before raw medication/condition/allergy lists.
- **Ask My Health** — unchanged visually; message bubbles already
  distinguish "From your records" vs "AI explanation" via `StatusBadge`,
  never blending the two.
- **Add to Health Memory** (formerly "Add Record") — screen heading and
  intro copy now read "Add to Health Memory"; the four entry points are
  Scan document / Upload document / WhatsApp / Add manually (the fourth
  is new — it's a scoped, honest "coming soon" prompt via `Alert`, not a
  new manual-entry form, since this pass explicitly excludes new backend
  functionality). Processing step copy now matches the brief exactly
  ("Report received" → "Reading document" → "Extracting health
  information" → "Comparing with your history" → "Updating Health
  Memory").
- **Me / Privacy** — Privacy's intro sentence now sits next to a
  shield-checkmark icon instead of inside a card, for a touch more
  trust-signaling without adding a security claim the app can't back.

## Platform conventions

- iOS and Android both go through the same React Native components;
  platform-specific behavior is isolated to the few places that need it
  (e.g. Ask's `KeyboardAvoidingView` uses `behavior="padding"` on iOS only).
- Back navigation uses `ScreenHeader`'s explicit back button (the root
  Stack has `headerShown: false`), which behaves consistently on both
  platforms rather than relying on native header chrome.
