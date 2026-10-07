import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AuthButton } from '../../components/AuthButton';
import { AuthError, AuthScreen } from '../../components/AuthScreen';
import { FOREST } from '../../design/brandSurface';
import { useAuth } from '../../hooks/useAuth';
import { AUTH_ROUTE } from '../../navigation/authRoutes';
import { authService } from '../../services/auth/authService';

const LINK_UNUSABLE =
  'This sign-in link has expired or was already used. Enter the 6-digit code from the email instead, or request a new one.';

/**
 * Where the link in a sign-in email returns to (`healthintelligence://auth-callback`,
 * see services/auth/emailLink.ts). It completes sign-in once with the
 * link's one-time code; the root layout then opens Home (or onboarding),
 * exactly as after entering the 6-digit code. If the link can't be used, it
 * says so and offers the way back to sign in. The code is never shown or logged.
 */
export default function EmailLinkCallbackScreen() {
  const { refreshUser } = useAuth();
  const { code, error } = useLocalSearchParams<{ code?: string; error?: string }>();
  const [failure, setFailure] = useState<string | undefined>(() => (error || !code ? LINK_UNUSABLE : undefined));
  const started = useRef(false);

  useEffect(() => {
    if (started.current || error || !code) return;
    started.current = true;
    (async () => {
      try {
        const result = await authService.completeEmailLink(code);
        if (!result.success) {
          setFailure(result.errorMessage);
          return;
        }
        await refreshUser();
      } catch {
        setFailure(LINK_UNUSABLE);
      }
    })();
  }, [code, error, refreshUser]);

  const backToSignIn = () => router.replace(AUTH_ROUTE);

  return (
    <AuthScreen
      title={failure ? 'Link can’t be used' : 'Signing you in…'}
      onBack={backToSignIn}
      footer={failure ? <AuthButton variant="primary" label="Back to sign in" onPress={backToSignIn} testID="email-link-back" /> : null}
      testID="email-link-callback"
    >
      {failure ? (
        <AuthError message={failure} />
      ) : (
        <View style={{ paddingVertical: 12 }}>
          <ActivityIndicator color={FOREST.ivory} accessibilityLabel="Signing you in" />
        </View>
      )}
    </AuthScreen>
  );
}
