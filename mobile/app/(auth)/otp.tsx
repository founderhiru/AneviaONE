import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { AuthButton } from '../../components/AuthButton';
import { AuthError, AuthScreen, AuthTextButton, leaveAuthStep, SIGN_IN_FALLBACK_ERROR } from '../../components/AuthScreen';
import { OtpInput } from '../../components/OtpInput';
import { useAuth } from '../../hooks/useAuth';
import { useSingleFlight } from '../../hooks/useSingleFlight';
import { authService } from '../../services/auth/authService';

/**
 * Code entry for Mobile (SMS) or email sign-in. Back returns to the number
 * entry so it can be corrected; a wrong or expired code clears for a retry,
 * and a new code can be requested — the person is never stuck here.
 */
export default function OtpScreen() {
  const { refreshUser } = useAuth();
  // Either an SMS code (mobileNumber) or an emailed code (email).
  const { mobileNumber, email } = useLocalSearchParams<{ mobileNumber?: string; email?: string }>();
  const isEmail = Boolean(email);
  const destination = (isEmail ? email : mobileNumber) ?? '';
  const verifyOnce = useSingleFlight();
  const resendOnce = useSingleFlight();

  const [otp, setOtp] = useState('');
  const [errorText, setErrorText] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  function handleVerify(code: string) {
    return verifyOnce(async () => {
      setErrorText(undefined);
      setVerifying(true);
      try {
        const result = isEmail
          ? await authService.verifyEmailOtp(destination, code)
          : await authService.verifyMobileOtp(destination, code);
        if (!result.success) {
          setErrorText(result.errorMessage);
          setOtp('');
          return;
        }
        // Root layout's redirect effect takes it from here (onboarding vs home).
        await refreshUser();
      } catch {
        setErrorText(SIGN_IN_FALLBACK_ERROR);
      } finally {
        setVerifying(false);
      }
    });
  }

  function handleResend() {
    return resendOnce(async () => {
      setErrorText(undefined);
      setResending(true);
      try {
        const result = isEmail ? await authService.sendEmailOtp(destination) : await authService.sendMobileOtp(destination);
        if (!result.success) setErrorText(result.errorMessage);
        else {
          setOtp('');
          setResent(true);
        }
      } catch {
        setErrorText(SIGN_IN_FALLBACK_ERROR);
      } finally {
        setResending(false);
      }
    });
  }

  return (
    <AuthScreen
      title="Enter the code"
      subtitle={`We sent a 6-digit code to ${destination}.`}
      footer={
        <>
          <AuthButton
            variant="primary"
            label="Verify"
            onPress={() => handleVerify(otp)}
            loading={verifying}
            disabled={otp.length < 6}
            testID="verify-otp"
          />
          <AuthTextButton label={isEmail ? 'Change email' : 'Change number'} onPress={leaveAuthStep} testID="otp-change-destination" />
        </>
      }
      testID="otp-screen"
    >
      <OtpInput
        appearance="onBrand"
        value={otp}
        onChange={(value) => {
          setOtp(value);
          setErrorText(undefined);
          if (value.length === 6) handleVerify(value);
        }}
        errorText={errorText}
      />
      <AuthError message={errorText} />
      <AuthTextButton
        label={resending ? 'Sending…' : resent ? 'Code sent — resend again' : 'Resend code'}
        onPress={handleResend}
        disabled={resending}
        testID="otp-resend"
      />
    </AuthScreen>
  );
}
