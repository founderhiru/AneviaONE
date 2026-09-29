import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button, ScreenContainer, TextInput } from '../../components';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/auth/authService';
import { isValidEmail } from '../../services/auth/authInput';

/**
 * Handles the auth entry points. Mobile OTP is the primary/default path
 * (India-first); email one-time code (no password) and Google are
 * secondary options. All three end in the same Supabase account model.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const { refreshUser } = useAuth();
  const { method } = useLocalSearchParams<{ method?: string }>();
  const isGoogle = method === 'google';
  const isEmail = method === 'email';

  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [errorText, setErrorText] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSendOtp() {
    setErrorText(undefined);
    setSending(true);
    const result = await authService.sendMobileOtp(mobileNumber);
    setSending(false);
    if (!result.success) {
      setErrorText(result.errorMessage);
      return;
    }
    router.push({ pathname: '/(auth)/otp', params: { mobileNumber } });
  }

  async function handleSendEmailCode() {
    setErrorText(undefined);
    setSending(true);
    const result = await authService.sendEmailOtp(email);
    setSending(false);
    if (!result.success) {
      setErrorText(result.errorMessage);
      return;
    }
    router.push({ pathname: '/(auth)/otp', params: { email: email.trim() } });
  }

  async function handleGoogleContinue() {
    setGoogleLoading(true);
    const result = await authService.signInWithGoogle();
    setGoogleLoading(false);
    if (!result.success) {
      if (!('cancelled' in result)) setErrorText(result.errorMessage);
      return;
    }
    await refreshUser();
  }

  if (isGoogle) {
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            Continue with Google
          </Text>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
            We&rsquo;ll use your Google account to sign you in securely. We never post on your behalf.
          </Text>
          {errorText ? (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite">
              {errorText}
            </Text>
          ) : null}
        </View>
        <Button label="Continue with Google" onPress={handleGoogleContinue} loading={googleLoading} testID="google-oauth-continue" />
      </ScreenContainer>
    );
  }

  if (isEmail) {
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            Enter your email
          </Text>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
            We&rsquo;ll email you a one-time code to verify it&rsquo;s you. No password needed.
          </Text>
          <TextInput
            label="Email"
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
        </View>
        <Button label="Send code" onPress={handleSendEmailCode} loading={sending} disabled={!isValidEmail(email)} testID="send-email-code" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
        <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          Enter your mobile number
        </Text>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
          We&rsquo;ll send you a one-time code to verify it&rsquo;s you.
        </Text>
        <TextInput
          label="Mobile number"
          placeholder="98765 43210"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          value={mobileNumber}
          onChangeText={setMobileNumber}
          errorText={errorText}
          testID="mobile-number-input"
        />
      </View>
      <Button label="Send OTP" onPress={handleSendOtp} loading={sending} disabled={mobileNumber.length < 10} testID="send-otp" />
    </ScreenContainer>
  );
}
