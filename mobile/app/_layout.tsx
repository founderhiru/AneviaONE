import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash, ConfigurationRequired, DemoModeBadge } from '../components';
import { APP_MODE, isDemoMode } from '../config/appMode';
import { useTheme } from '../design/theme';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { markLaunchSplashDone } from '../hooks/useLaunchSplash';
import { AUTH_ROUTE, PROFILE_SETUP_ROUTE } from '../navigation/authRoutes';

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();
  // The animated launch sequence always plays at least once per app
  // session (cold launch), and never again for in-app navigation — this
  // component (and its state) lives for the lifetime of the Stack root,
  // not per-screen. `showSplash` stays true until the reveal has finished
  // AND auth/session initialization has resolved, whichever is later.
  // The navigator stays mounted underneath the full-screen splash, so the
  // redirect below completes behind it and the placeholder `index` route
  // ("Loading…") is never seen.
  const [splashRevealDone, setSplashRevealDone] = useState(false);
  const showSplash = !splashRevealDone;

  useEffect(() => {
    if (isLoading) return;

    const segmentList = segments as unknown as string[];
    const inAuthGroup = segmentList[0] === '(auth)';
    // Explore is the sample health history, open to anyone before sign-in.
    const inExplore = segmentList[0] === 'explore';
    const atEntry = segmentList.length === 0; // the placeholder `index` route

    if (!user && !inAuthGroup && !inExplore) {
      // Launch, a chosen sign-out and an expired session all go to the one
      // sign-in screen, Welcome (which says why when a session ran out).
      router.replace(AUTH_ROUTE);
      return;
    }

    // First stop after the first sign-in: the optional "Set up your health
    // profile" step, once per account. Continue and Skip both mark it done,
    // which lands back here and moves on — it is never shown again, and an
    // account that has done it never passes through it.
    const atProfileSetup = segmentList[0] === 'profile' && segmentList[1] === 'setup';
    if (user && !user.identityOnboardingComplete) {
      if (!atProfileSetup) router.replace(PROFILE_SETUP_ROUTE);
      return;
    }

    if (user && !user.onboardingComplete && segmentList[1] !== 'onboarding') {
      router.replace('/(auth)/onboarding');
      return;
    }

    // Once signed in (e.g. via "Make it yours"), the sample gives way to the
    // person's own Health Memory.
    if (user && user.onboardingComplete && (inAuthGroup || inExplore || atEntry || atProfileSetup)) {
      router.replace('/(tabs)/home');
    }
  }, [user, isLoading, segments, router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        {/* Home is the root of the signed-in app: no swipe back into sign-in. */}
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', gestureEnabled: false }} />
        {/* Reached only by redirect after sign-in; Continue / Skip move on. */}
        <Stack.Screen name="profile/setup" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="explore" />
        <Stack.Screen name="add" options={{ presentation: 'modal' }} />
      </Stack>
      {showSplash ? (
        <AnimatedSplash
          ready={!isLoading}
          onFinished={() => {
            setSplashRevealDone(true);
            markLaunchSplashDone();
          }}
        />
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  // A production build without backend configuration explains that it can't
  // start, rather than silently running on mock sign-in or sample data
  // (see config/appMode.ts).
  if (APP_MODE.configurationError) {
    return (
      <SafeAreaProvider>
        <ConfigurationRequired message={APP_MODE.configurationError} />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <RootNavigator />
          {isDemoMode ? <DemoModeBadge /> : null}
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
