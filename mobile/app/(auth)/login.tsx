import React, { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { AuthButton } from '../../components/AuthButton';
import { AuthError, AuthScreen, AuthTextButton, leaveAuthStep, SIGN_IN_FALLBACK_ERROR } from '../../components/AuthScreen';
import { GOOGLE_G } from '../../components/SignInMethods';
import { TextInput } from '../../components/TextInput';
import { useAppleSignInAvailable } from '../../hooks/useAppleSignInAvailable';
import { useSignInMethods } from '../../hooks/useSignInMethods';
import { useAuth } from '../../hooks/useAuth';
import { useSingleFlight } from '../../hooks/useSingleFlight';
import { isValidEmail } from '../../services/auth/authInput';
import { AUTH_ROUTE } from '../../navigation/authRoutes';
import { authService } from '../../services/auth/authService';

/**
 * The Google, Apple and Email steps of sign-in. The sign-in form itself —
 * the mobile number, then these options — is on Welcome; this route holds
 * only the step each option opens (`?method=google|apple|email`) and, with
 * no method, sends the person to Welcome. All of them end in the same
 * Supabase account model.
 *
 * Every branch has a visible Back, and none can strand the person: one
 * attempt runs at a time, loading always clears, a cancelled Google/Apple
 * sheet returns to where they started, and a failure offers Try again.
 */
export default function LoginScreen() {
  const { refreshUser } = useAuth();
  const { method } = useLocalSearchParams<{ method?: string }>();
  const appleAvailable = useAppleSignInAvailable();
  const signInMethods = useSignInMethods();
  const singleFlight = useSingleFlight();

  const [email, setEmail] = useState('');
  const [errorText, setErrorText] = useState<string | undefined>();
  /** Safe diagnostic for a Google/Apple failure (e.g. `bad_code_verifier`). */
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  /** One sign-in step: never concurrent, loading always cleared, a thrown
   * error shown as a recoverable message rather than a frozen screen. */
  function attempt(task: () => Promise<void>) {
    return singleFlight(async () => {
      setErrorText(undefined);
      setErrorCode(undefined);
      setPending(true);
      try {
        await task();
      } catch (error) {
        if (__DEV__) console.warn('[auth] sign-in step failed', (error as Error)?.message);
        setErrorText(SIGN_IN_FALLBACK_ERROR);
      } finally {
        setPending(false);
      }
    });
  }

  function handleSendEmailCode() {
    return attempt(async () => {
      const result = await authService.sendEmailOtp(email);
      if (!result.success) {
        setErrorText(result.errorMessage);
        return;
      }
      router.push({ pathname: '/(auth)/otp', params: { email: email.trim() } });
    });
  }

  function handleProvider(provider: 'google' | 'apple') {
    return attempt(async () => {
      const result = provider === 'google' ? await authService.signInWithGoogle() : await authService.signInWithApple();
      if (!result.success) {
        // Closing the Google/Apple sheet is a choice, not an error: return to
        // the sign-in options the person came from.
        if ('cancelled' in result) leaveAuthStep();
        else {
          setErrorText(result.errorMessage);
          setErrorCode(result.diagnosticCode);
        }
        return;
      }
      // The root layout's redirect takes it from here (onboarding vs home).
      await refreshUser();
    });
  }

  const backToOptions = errorText ? (
    <AuthTextButton label="Back to sign-in options" onPress={leaveAuthStep} testID="auth-cancel" />
  ) : null;

  if (method === 'apple') {
    // Offered only when this device supports it AND the project has the Apple
    // provider switched on — never as a button that would quietly fail.
    const appleState = !appleAvailable ? 'device' : signInMethods === null ? 'checking' : signInMethods.apple ? 'ready' : 'provider';
    return (
      <AuthScreen
        title="Continue with Apple"
        subtitle={
          appleState === 'ready' || appleState === 'checking'
            ? 'Sign in with your Apple ID. If you choose Hide My Email, Apple gives us a private address that forwards to you.'
            : appleState === 'provider'
              ? 'Sign in with Apple isn’t available yet. Please continue with your mobile number, Google or email.'
              : 'Sign in with Apple isn’t available on this device. Please continue with your mobile number or Google.'
        }
        footer={
          appleState === 'checking' ? null : appleState === 'ready' ? (
            <>
              <AuthButton
                variant="apple"
                label="Continue with Apple"
                onPress={() => handleProvider('apple')}
                loading={pending}
                testID="apple-signin-continue"
              />
              {backToOptions}
            </>
          ) : (
            <AuthButton variant="primary" label="Back to sign-in options" onPress={leaveAuthStep} testID="auth-cancel" />
          )
        }
      >
        <AuthError message={errorText} code={errorCode} />
      </AuthScreen>
    );
  }

  if (method === 'google') {
    return (
      <AuthScreen
        title="Continue with Google"
        subtitle="We’ll use your Google account to sign you in securely. We never post on your behalf."
        footer={
          <>
            <AuthButton
              variant="primary"
              label={errorText ? 'Try again' : 'Continue with Google'}
              logo={GOOGLE_G}
              onPress={() => handleProvider('google')}
              loading={pending}
              testID="google-oauth-continue"
            />
            {backToOptions}
          </>
        }
      >
        <AuthError message={errorText} code={errorCode} />
      </AuthScreen>
    );
  }

  if (method === 'email') {
    return (
      <AuthScreen
        title="Continue with Email"
        subtitle="Enter your email address and we’ll send you a secure sign-in code."
        footer={
          <AuthButton
            variant="primary"
            label="Send code"
            onPress={handleSendEmailCode}
            loading={pending}
            disabled={!isValidEmail(email)}
            testID="send-email-code"
          />
        }
      >
        <TextInput
          appearance="onBrand"
          label="Email address"
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          errorText={errorText}
          testID="email-input"
        />
      </AuthScreen>
    );
  }

  // No method: the mobile number is entered on Welcome — the one sign-in
  // form — so this route has no form of its own and simply goes there.
  return <Redirect href={AUTH_ROUTE} />;
}
