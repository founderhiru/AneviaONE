import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '../components';
import { useTheme } from '../design/theme';
import { AuthProvider, useAuth } from '../hooks/useAuth';

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();
  // The animated launch sequence always plays at least once per app
  // session (cold launch), and never again for in-app navigation — this
  // component (and its state) lives for the lifetime of the Stack root,
  // not per-screen. `showSplash` stays true until the reveal has finished
  // AND auth/session initialization has resolved, whichever is later, so
  // a slow session check is masked by the splash's settled frame instead
  // of an artificial delay or a second loading spinner.
  const [splashRevealDone, setSplashRevealDone] = useState(false);
  const showSplash = !splashRevealDone;

  useEffect(() => {
    if (isLoading || showSplash) return;

    const segmentList = segments as unknown as string[];
    const inAuthGroup = segmentList[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/welcome');
      return;
    }

    if (user && !user.onboardingComplete && segmentList[1] !== 'onboarding') {
      router.replace('/(auth)/onboarding');
      return;
    }

    if (user && user.onboardingComplete && inAuthGroup) {
      router.replace('/(tabs)/home');
    }
  }, [user, isLoading, showSplash, segments, router]);

  if (showSplash) {
    return (
      <SafeAreaProvider style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <AnimatedSplash ready={!isLoading} onFinished={() => setSplashRevealDone(true)} />
      </SafeAreaProvider>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
