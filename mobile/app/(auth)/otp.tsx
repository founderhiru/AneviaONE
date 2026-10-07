import React, { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { AuthButton } from '../../components/AuthButton';
import { AuthError, AuthScreen, AuthTextButton, leaveAuthStep, SIGN_IN_FALLBACK_ERROR } from '../../components/AuthScreen';
import { OtpInput } from '../../components/OtpInput';
import { useAuth } from '../../hooks/useAuth';
import { useSingleFlight } from '../../hooks/useSingleFlight';
import { formatInternational } from '../../config/phoneCountries';
import { maskEmail } from '../../services/auth/authInput';
import { authService } from '../../services/auth/authService';

/**
 * Code entry for Mobile (SMS) or email sign-in. Back returns to the number
 * entry so it can be corrected; a wrong or expired code clears for a retry,
 * and a new code can be requested — the person is never stuck here.
 *
 * A new code can be asked for once a short cooldown has passed (from when
 * the last code was sent), so a resend can't be hammered. The code itself is
 * never logged or kept anywhere but this screen's input.
 */

/** Seconds before another code can be requested (Supabase also rate-limits). */
export const RESEND_COOLDOWN_S = { sms: 30, email: 60 } as const;
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
  // A code was just sent to get here, so the cooldown starts now.
  const [cooldown, setCooldown] = useState<number>(isEmail ? RESEND_COOLDOWN_S.email : RESEND_COOLDOWN_S.sms);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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
          setCooldown(isEmail ? RESEND_COOLDOWN_S.email : RESEND_COOLDOWN_S.sms);
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
      title={isEmail ? 'Check your email' : 'Verify your number'}
      subtitle={
        isEmail ? `Enter the 6-digit code we sent to ${maskEmail(destination)}.` : `We sent a 6-digit code to\n${formatInternational(destination)}`
      }
      footer={
        <>
          <AuthButton
            variant="primary"
            label="Verify code"
            onPress={() => handleVerify(otp)}
            loading={verifying}
            disabled={otp.length < 6}
            testID="verify-otp"
          />
          <AuthTextButton label={isEmail ? 'Use a different email' : 'Change mobile number'} onPress={leaveAuthStep} testID="otp-change-destination" />
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
        label={
          resending
            ? 'Sending…'
            : cooldown > 0
              ? `${resent ? 'Code sent · ' : ''}Resend code in ${cooldown}s`
              : 'Resend code'
        }
        onPress={handleResend}
        disabled={resending || cooldown > 0}
        testID="otp-resend"
      />
    </AuthScreen>
  );
}
