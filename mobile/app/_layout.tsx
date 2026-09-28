import 'react-native-reanimated';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingState } from '../components';
import { useTheme } from '../design/theme';
import { AuthProvider, useAuth } from '../hooks/useAuth';

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();

  useEffect(() => {
    if (isLoading) return;

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
  }, [user, isLoading, segments, router]);

  if (isLoading) {
    return (
      <SafeAreaProvider style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <LoadingState fullScreen label="Loading your Health Memory…" />
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
