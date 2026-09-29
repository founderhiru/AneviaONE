import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Button, OtpInput, ScreenContainer } from '../../components';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/auth/authService';

export default function OtpScreen() {
  const theme = useTheme();
  const { refreshUser } = useAuth();
  // Either an SMS code (mobileNumber) or an emailed code (email).
  const { mobileNumber, email } = useLocalSearchParams<{ mobileNumber?: string; email?: string }>();
  const isEmail = Boolean(email);
  const destination = (isEmail ? email : mobileNumber) ?? '';

  const [otp, setOtp] = useState('');
  const [errorText, setErrorText] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify(code: string) {
    setErrorText(undefined);
    setVerifying(true);
    const result = isEmail
      ? await authService.verifyEmailOtp(destination, code)
      : await authService.verifyMobileOtp(destination, code);
    setVerifying(false);
    if (!result.success) {
      setErrorText(result.errorMessage);
      return;
    }
    await refreshUser();
    // Root layout's redirect effect takes it from here (onboarding vs home).
  }

  async function handleResend() {
    setResending(true);
    if (isEmail) await authService.sendEmailOtp(destination);
    else await authService.sendMobileOtp(destination);
    setResending(false);
  }

  return (
    <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
        <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          Enter the code
        </Text>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
          We sent a 6-digit code to {destination}.
        </Text>
        <OtpInput
          value={otp}
          onChange={(value) => {
            setOtp(value);
            setErrorText(undefined);
            if (value.length === 6) handleVerify(value);
          }}
          errorText={errorText}
        />
        {errorText ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite">
            {errorText}
          </Text>
        ) : null}
        <Button label="Resend code" variant="ghost" onPress={handleResend} loading={resending} fullWidth={false} />
      </View>
      <Button
        label="Verify"
        onPress={() => handleVerify(otp)}
        loading={verifying}
        disabled={otp.length < 6}
        testID="verify-otp"
      />
    </ScreenContainer>
  );
}
