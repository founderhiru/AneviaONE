import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';

import { LEGAL_LINKS } from '../config/legal';
import { BRAND_TYPE, FOREST, SHEET } from '../design/brandSurface';
import { useAppleSignInAvailable } from '../hooks/useAppleSignInAvailable';
import { useSignInMethods } from '../hooks/useSignInMethods';
import { openAuth } from '../navigation/authRoutes';

/**
 * The secondary ways in, shared by Welcome (white sheet) and the mobile
 * sign-in step (forest field) so both offer exactly the same choices:
 *
 *   Google | Apple | Email
 *
 * Google is always offered. Apple appears only where the device supports
 * Sign in with Apple AND the project has the Apple provider switched on;
 * Email only when the Email provider is on. Nothing disabled is ever shown —
 * a provider switched on later simply appears, in its place.
 */
export type SignInSurface = 'sheet' | 'field';

// Official Google "G" (gstatic.com/images/branding/googleg), used unmodified.
export const GOOGLE_G = require('../assets/auth/google-g.png');

export function SignInDivider({ surface }: { surface: SignInSurface }) {
  const tone = surface === 'sheet' ? sheetTone : fieldTone;
  return (
    <View style={styles.dividerRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.rule, { backgroundColor: tone.rule }]} />
      <Text style={[styles.dividerLabel, { color: tone.faint }]}>or continue with</Text>
      <View style={[styles.rule, { backgroundColor: tone.rule }]} />
    </View>
  );
}

export function SignInMethodRow({ surface }: { surface: SignInSurface }) {
  const methods = useSignInMethods();
  const appleAvailable = useAppleSignInAvailable() && methods?.apple === true;
  const emailAvailable = methods?.email === true;
  const tone = surface === 'sheet' ? sheetTone : fieldTone;

  return (
    <View style={styles.methods} testID="sign-in-methods">
      <MethodButton surface={surface} label="Continue with Google" caption="Google" route="google">
        <Image source={GOOGLE_G} style={styles.googleG} resizeMode="contain" accessibilityIgnoresInvertColors />
      </MethodButton>
      {appleAvailable ? (
        <MethodButton surface={surface} label="Continue with Apple" caption="Apple" route="apple">
          <Ionicons name="logo-apple" size={24} color="#000000" testID="apple-logo" />
        </MethodButton>
      ) : null}
      {emailAvailable ? (
        <MethodButton surface={surface} label="Continue with Email" caption="Email" route="email">
          <Ionicons name="mail-outline" size={22} color={tone.icon} />
        </MethodButton>
      ) : null}
    </View>
  );
}

/** "By continuing, you agree to our Terms of Service and Privacy Policy." */
export function LegalNotice({ surface, lead, testID }: { surface: SignInSurface; lead?: string; testID?: string }) {
  const tone = surface === 'sheet' ? sheetTone : fieldTone;
  return (
    <Text style={[styles.fine, { color: tone.faint }]} testID={testID}>
      {lead ? `${lead} ` : ''}By continuing, you agree to our{' '}
      <Text style={[styles.fineLink, { color: tone.link }]} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(LEGAL_LINKS.terms.url)} testID="legal-terms">
        {LEGAL_LINKS.terms.label}
      </Text>{' '}
      and{' '}
      <Text style={[styles.fineLink, { color: tone.link }]} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(LEGAL_LINKS.privacy.url)} testID="legal-privacy">
        {LEGAL_LINKS.privacy.label}
      </Text>
      .
    </Text>
  );
}

/**
 * One round button with the provider's mark and a short caption beneath.
 * All three share one treatment; Apple's is its standard black logo on
 * white with an outline (Apple's "white outline" logo-button style). The
 * caption sits outside the button.
 */
function MethodButton({
  surface,
  label,
  caption,
  route,
  children,
}: {
  surface: SignInSurface;
  label: string;
  caption: string;
  route: 'google' | 'apple' | 'email';
  children: React.ReactNode;
}) {
  const tone = surface === 'sheet' ? sheetTone : fieldTone;
  return (
    <View style={styles.method}>
      <Pressable
        onPress={() => openAuth(route)}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={`continue-with-${route}`}
        hitSlop={4}
        style={({ pressed }) => [
          styles.methodButton,
          { backgroundColor: tone.fill, borderColor: tone.border },
          { opacity: pressed ? 0.75 : 1 },
        ]}
      >
        {children}
      </Pressable>
      <Text style={[styles.methodCaption, { color: tone.muted }]} importantForAccessibility="no" accessibilityElementsHidden>
        {caption}
      </Text>
    </View>
  );
}

/** White sheet (Welcome): hairline circles on white, forest ink. */
const sheetTone = { fill: SHEET.surface, border: SHEET.hairline, icon: SHEET.ink, muted: SHEET.textMuted, faint: SHEET.textFaint, rule: SHEET.hairline, link: SHEET.link };
/** Forest field (sign-in steps): ivory circles, so the marks read cleanly. */
const fieldTone = { fill: FOREST.warmIvory, border: FOREST.warmIvory, icon: FOREST.ink, muted: FOREST.textMuted, faint: FOREST.textFaint, rule: FOREST.hairline, link: FOREST.champagne };

const styles = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerLabel: { ...BRAND_TYPE.fine },
  methods: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  method: { alignItems: 'center', gap: 6 },
  methodButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  methodCaption: { ...BRAND_TYPE.fine, fontSize: 12 },
  googleG: { width: 22, height: 22 },
  fine: { ...BRAND_TYPE.fine, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  fineLink: { textDecorationLine: 'underline' },
});
