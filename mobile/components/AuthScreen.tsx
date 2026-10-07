import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BRAND_TYPE, FOREST } from '../design/brandSurface';
import { EmeraldField, EXPLORE } from './explore/ExploreUI';
import { BrandMark } from './BrandMark';

/** Shown when a sign-in step throws instead of returning a result. */
export const SIGN_IN_FALLBACK_ERROR = 'Something went wrong. Please try again.';

/**
 * Leaves a sign-in step: back to wherever the person came from (Welcome,
 * Make it yours, or the previous step). If there is no history — the step
 * was opened directly, e.g. from a link — it falls back to Welcome, so a
 * sign-in screen is never a dead end.
 */
export function leaveAuthStep() {
  if (router.canGoBack()) router.back();
  else router.replace('/(auth)/welcome');
}

/**
 * Frame for the steps that follow Welcome's sign-in form (code, Google,
 * Apple, Email): the deep-emerald field with its sweep of gold light, a
 * visible Back control, the mark, a title and the step's content, with
 * anything pinned at the bottom.
 */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
  onBack = leaveAuthStep,
  testID,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
  testID?: string;
}) {
  const backIcon = Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back';
  return (
    <View style={styles.root} testID={testID}>
      <StatusBar style="light" />
      <EmeraldField id="authField" />
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
            testID="auth-back"
          >
            <Ionicons name={backIcon} size={24} color={FOREST.ivory} />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>

          <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bounces={false}>
            <BrandMark size={72} id="authStepMark" />
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {children ? <View style={styles.content}>{children}</View> : null}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** A quiet text action on the brand surface ("Resend code", "Back to sign-in options"). */
export function AuthTextButton({ label, onPress, disabled, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={8}
      testID={testID}
      style={({ pressed }) => [styles.textButton, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
    >
      <Text style={styles.textButtonLabel}>{label}</Text>
    </Pressable>
  );
}

/** A recoverable sign-in error, announced to screen readers. `code` is a
 * short, non-secret diagnostic (e.g. `bad_code_verifier`) shown small
 * underneath so a TestFlight report identifies the real failure. */
export function AuthError({ message, code }: { message?: string; code?: string }) {
  if (!message) return null;
  return (
    <View style={styles.errorBlock}>
      <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="auth-error">
        {message}
      </Text>
      {code ? (
        <Text style={styles.errorCode} selectable testID="auth-error-code">
          {`Error code: ${code}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: EXPLORE.field },
  safe: { flex: 1, paddingHorizontal: 24 },
  flex: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 44, gap: 2, marginLeft: -6 },
  backLabel: { ...BRAND_TYPE.body, color: FOREST.ivory },
  body: { flexGrow: 1, justifyContent: 'center', alignItems: 'stretch', paddingVertical: 24, gap: 12 },
  title: { ...BRAND_TYPE.title, color: FOREST.text, marginTop: 12 },
  subtitle: { ...BRAND_TYPE.body, color: FOREST.textMuted },
  content: { gap: 12, marginTop: 8 },
  footer: { gap: 12, paddingTop: 8, paddingBottom: 8 },
  textButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'center' },
  textButtonLabel: { ...BRAND_TYPE.body, fontWeight: '600', color: FOREST.champagne },
  errorBlock: { gap: 4 },
  error: { ...BRAND_TYPE.fine, fontSize: 14, color: FOREST.danger },
  errorCode: { ...BRAND_TYPE.fine, fontSize: 12, color: FOREST.textFaint },
});
