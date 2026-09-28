# Mobile Design Rules

Design tokens and component rules for the app, per spec section 3 (design
system) and section 4/33 (platform conventions, accessibility). Everything
here lives under `mobile/design/` and `mobile/components/`.

## Aesthetic principles

Premium, calm, trustworthy, minimal. A warm/light canvas with deep navy as
the anchor color. Deliberately avoids:
- Excessive red (red is reserved for genuine danger/destructive actions,
  never for routine emphasis)
- Heavy gradients
- Gamification (badges, streaks, progress bars framed as "scores")
- "Medical dashboard" saturation — no default-red vitals, no traffic-light
  coding of health data without an explicit legend

Trend colors (`trendUp` / `trendDown` / `trendFlat`) are intentionally
**not** red/green — an upward trend isn't automatically "bad" and a
downward one isn't automatically "good" outside clinical context the app
doesn't have. See `design/colors.ts`.

## Tokens

All tokens are consumed through `useTheme()` (`design/theme.ts`), which
picks `lightColors` or `darkColors` (`design/colors.ts`) based on
`useColorScheme()`, and aggregates:

- **Colors** — semantic names only (`background`, `textPrimary`,
  `brandPrimary`, `danger`, …), never raw hex in screens/components.
- **Typography** (`design/typography.ts`) — a fixed scale
  (`displayLarge`/`displayMedium`, `headingLarge/Medium/Small`,
  `bodyLarge/Medium/Small`, `labelLarge/Medium`, `caption`).
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
`HealthChangeCard`, `TrendCard`, `TimelineEvent`, `EmptyState`,
`LoadingState` (+ `SkeletonBlock`), `ErrorState`, `ProcessingState`,
`Modal`, `BottomSheet`, `ScreenContainer`, `ScreenHeader`.

Screens compose these rather than rebuilding primitives inline. New
one-off UI should still be built from `theme.*` tokens even when it
doesn't warrant a new shared component.

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

## Platform conventions

- iOS and Android both go through the same React Native components;
  platform-specific behavior is isolated to the few places that need it
  (e.g. Ask's `KeyboardAvoidingView` uses `behavior="padding"` on iOS only).
- Back navigation uses `ScreenHeader`'s explicit back button (the root
  Stack has `headerShown: false`), which behaves consistently on both
  platforms rather than relying on native header chrome.
