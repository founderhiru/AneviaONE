import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAtmosphere } from '../../components/BrandAtmosphere';
import { BrandMark } from '../../components/BrandMark';
import { BrandWordmark } from '../../components/BrandWordmark';
import { HealthStoryHero } from '../../components/HealthStoryHero';
import { MobileSignInForm } from '../../components/MobileSignInForm';
import { LegalNotice } from '../../components/SignInMethods';
import { BRAND } from '../../config/brand';
import { BRAND_TYPE, FOREST, SHEET } from '../../design/brandSurface';
import { SESSION_EXPIRED_MESSAGE, useAuth } from '../../hooks/useAuth';
import { useLaunchSplashDone } from '../../hooks/useLaunchSplash';

const [promiseLead, promiseRest] = BRAND.welcomeTagline.split(/(?<=\.)\s+/);

/**
 * Welcome is THE sign-in screen. The forest field tells the story — records
 * joined on one thread through time — and the white sheet holds the one
 * sign-in form (MobileSignInForm): the mobile number and Continue, then
 * Google, Apple and Email. Apple and Email appear only when the project has
 * them switched on (and Apple only where the device supports it), so
 * nothing is offered that can't work.
 *
 * Every signed-out entry point opens this screen (openAuth); when another
 * screen opened it, a Back control returns there.
 *
 * The launch splash fades straight into this screen; the hero and sheet
 * make a short entrance once the splash has gone (instantly with Reduce
 * Motion).
 */
export default function WelcomeScreen() {
  const { notice } = useAuth();
  // Set by openAuth() when another screen sends the person here to sign in.
  const { from: openedFrom } = useLocalSearchParams<{ from?: string }>();
  const insets = useSafeAreaInsets();
  const splashDone = useLaunchSplashDone();
  // null until the setting is read: nothing moves before we know.
  const reduceMotion = useReduceMotion();
  const entrance = useEntrance(splashDone, reduceMotion);

  return (
    <View style={styles.root} testID="welcome-screen">
      <StatusBar style="light" />
      <BrandAtmosphere id="welcomeField" />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.hero}>
        <Animated.View style={[styles.heroCopy, entrance.hero]}>
          {/* The AneviaONE symbol (the splash's mark), then the wordmark. */}
          <BrandMark size={56} id="welcomeMark" />
          <BrandWordmark />
          <Text style={styles.promise} accessibilityLabel={BRAND.welcomeTagline} testID="welcome-promise">
            {promiseLead}
            {promiseRest ? `\n${promiseRest}` : ''}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.heroArt, entrance.art]}>
          {/* The hero's scenes loop once the splash has gone; Reduce Motion
              shows its settled first scene instead. */}
          <HealthStoryHero playing={splashDone && reduceMotion === false} still={reduceMotion === true} testID="welcome-hero-art" />
        </Animated.View>
      </SafeAreaView>

      {/* Skip: the quiet way past sign-in, top-right of the hero. */}
      <Animated.View style={[styles.skip, { top: insets.top + 4 }, { opacity: entrance.hero.opacity }]}>
        <Pressable
          onPress={() => router.push('/explore')}
          accessibilityRole="button"
          accessibilityLabel="Skip"
          accessibilityHint="Opens a sample health history. No sign-in needed."
          testID="explore-cta"
          hitSlop={10}
          style={({ pressed }) => [styles.explore, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.exploreLabel} maxFontSizeMultiplier={1.6}>
            Skip
          </Text>
          <Ionicons name="arrow-forward" size={15} color={FOREST.textMuted} />
        </Pressable>
      </Animated.View>

      {/* Opened from elsewhere (e.g. Make it yours → Get started): Back returns there. */}
      {openedFrom && router.canGoBack() ? (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          testID="auth-back"
          style={({ pressed }) => [styles.back, { top: insets.top + 4, opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={24} color={FOREST.ivory} />
        </Pressable>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined}>
      <Animated.View style={[styles.sheet, entrance.sheet]} testID="welcome-sheet">
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheetInner}>
          {notice === 'session_expired' ? (
            <Text style={styles.notice} accessibilityRole="alert" testID="session-expired-notice">
              {SESSION_EXPIRED_MESSAGE}
            </Text>
          ) : null}
          <MobileSignInForm />

          <View style={styles.legal}>
            <LegalNotice surface="sheet" lead="Your health information belongs to you." testID="welcome-legal" />
          </View>
        </SafeAreaView>
      </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** How long to wait for the Reduce Motion setting before assuming it's off. */
const REDUCE_MOTION_WAIT_MS = 400;

/** Whether the person has Reduce Motion on; null until it has been read. */
function useReduceMotion(): boolean | null {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    const settle = (value: boolean) => mounted && setReduceMotion((current) => current ?? value);
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => mounted && setReduceMotion(value))
      .catch(() => settle(false));
    // Never let an unanswered query keep the screen from appearing.
    const fallback = setTimeout(() => settle(false), REDUCE_MOTION_WAIT_MS);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => setReduceMotion(value));
    return () => {
      mounted = false;
      clearTimeout(fallback);
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

/** Short entrance after the splash: hero copy and art fade in and settle,
 * the sheet rises — once; the sheet never moves again. Instant when Reduce
 * Motion is on. */
function useEntrance(splashDone: boolean, reduceMotion: boolean | null) {
  const [hero] = useState(() => new Animated.Value(0));
  const [sheet] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // Reduce Motion: everything simply shows. Otherwise wait until the
    // splash is gone (at once on any later visit), then play.
    if (reduceMotion) {
      hero.stopAnimation();
      sheet.stopAnimation();
      hero.setValue(1);
      sheet.setValue(1);
      return;
    }
    if (!splashDone || reduceMotion === null) return;
    Animated.parallel([
      Animated.timing(hero, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(sheet, { toValue: 1, duration: 460, delay: 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [reduceMotion, splashDone, hero, sheet]);

  // Underneath the splash only the field is drawn, so the splash fades into
  // it and the entrance settles in on top.
  return useMemo(
    () => ({
      hero: { opacity: hero, transform: [{ translateY: hero.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
      art: { opacity: hero, transform: [{ scale: hero.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] },
      sheet: { opacity: sheet, transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }] },
    }),
    [hero, sheet],
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: FOREST.field },
  hero: { flex: 1, minHeight: 220 },
  // The hero sits low enough to clear Skip and rest on the sheet.
  heroCopy: { alignItems: 'center', gap: 4, paddingTop: 6, paddingHorizontal: 24 },
  promise: { ...BRAND_TYPE.body, fontSize: 17, lineHeight: 24, color: FOREST.textMuted, textAlign: 'center', marginTop: -2 },
  // The story art sits low in the hero, just clear of the sheet.
  heroArt: { flex: 1, marginHorizontal: 8, marginTop: 14, marginBottom: 8 },
  sheet: {
    backgroundColor: SHEET.surface,
    borderTopLeftRadius: SHEET.radius,
    borderTopRightRadius: SHEET.radius,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  sheetInner: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 12, gap: 12 },
  notice: { ...BRAND_TYPE.fine, fontSize: 14, color: SHEET.link, textAlign: 'center' },
  // Skip: a quiet text link into the sample history, not a button.
  skip: { position: 'absolute', right: 12 },
  explore: { minHeight: 44, minWidth: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 8 },
  exploreLabel: { ...BRAND_TYPE.body, fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: 0.2, color: FOREST.textMuted },
  legal: { marginTop: 2 },
  back: { position: 'absolute', left: 12, minWidth: 44, minHeight: 44, justifyContent: 'center' },
});
