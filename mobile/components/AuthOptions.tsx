import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { useAppleSignInAvailable } from '../hooks/useAppleSignInAvailable';
import { AuthButton } from './AuthButton';

// Official Google "G" (gstatic.com/images/branding/googleg), used unmodified.
export const GOOGLE_G = require('../assets/auth/google-g.png');

/**
 * The sign-in entry points, for the brand surface: Mobile (primary), then
 * Google and Apple. Used on Welcome and "Make it yours" so all of them lead
 * into the same existing login flow; each sign-in step has its own Back, so
 * the person can always return here.
 *
 * All three are the same `AuthButton` — same height, corners and label type.
 * Apple appears only where Sign in with Apple is available (iOS, never
 * Android or web).
 */
export function AuthOptions() {
  const appleAvailable = useAppleSignInAvailable();
  return (
    <View style={styles.list}>
      <AuthButton
        variant="primary"
        label="Continue with Mobile"
        icon="phone-portrait-outline"
        onPress={() => router.push('/(auth)/login?method=mobile')}
        testID="continue-with-mobile"
      />
      <AuthButton
        label="Continue with Google"
        logo={GOOGLE_G}
        onPress={() => router.push('/(auth)/login?method=google')}
        testID="continue-with-google"
      />
      {appleAvailable ? (
        <AuthButton
          variant="apple"
          label="Continue with Apple"
          onPress={() => router.push('/(auth)/login?method=apple')}
          testID="continue-with-apple"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
});
