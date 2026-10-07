import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { DEFAULT_PHONE_COUNTRY, nationalDigits, toInternational, type PhoneCountry } from '../config/phoneCountries';
import { BRAND_TYPE, SHEET } from '../design/brandSurface';
import { useSingleFlight } from '../hooks/useSingleFlight';
import { authService } from '../services/auth/authService';
import { AuthButton } from './AuthButton';
import { SIGN_IN_FALLBACK_ERROR } from './AuthScreen';
import { PhoneNumberField } from './PhoneNumberField';
import { SignInDivider, SignInMethodRow } from './SignInMethods';

/**
 * THE sign-in form — the only one in the app. It lives in Welcome's white
 * sheet; every signed-out entry point opens Welcome (openAuth), so everyone
 * signs in here.
 *
 *   Log in or sign up
 *   [ 🇮🇳 ▾ ] [ +91  Enter mobile number ]
 *   [ Continue ]                 ← one action: a known number logs in,
 *   ── or continue with ──          a new one signs up, via the same code
 *   Google | Apple* | Email      * only when the Apple provider is on
 *
 * Continue sends the code through the existing Mobile OTP service and opens
 * the existing code step. One send at a time; errors are shown plainly and
 * clear when the number is edited. Nothing about the number or code is logged.
 */
export function MobileSignInForm() {
  const singleFlight = useSingleFlight();
  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  /** National digits only; the dial code comes from `country`. */
  const [digits, setDigits] = useState('');
  const [errorText, setErrorText] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const international = toInternational(digits, country);

  function handleContinue() {
    return singleFlight(async () => {
      if (!international) {
        setErrorText(`Enter a valid ${country.nationalLength}-digit mobile number.`);
        return;
      }
      setErrorText(undefined);
      setPending(true);
      try {
        const result = await authService.sendMobileOtp(international);
        if (!result.success) {
          setErrorText(result.errorMessage);
          return;
        }
        router.push({ pathname: '/(auth)/otp', params: { mobileNumber: international } });
      } catch {
        setErrorText(SIGN_IN_FALLBACK_ERROR);
      } finally {
        setPending(false);
      }
    });
  }

  return (
    <View style={styles.form} testID="mobile-sign-in-form">
      <Text style={styles.label} accessibilityRole="header">
        Log in or sign up
      </Text>
      <PhoneNumberField
        country={country}
        onCountryChange={(next) => {
          setCountry(next);
          setDigits((current) => nationalDigits(current, next));
        }}
        value={digits}
        onChangeText={(next) => {
          setDigits(next);
          setErrorText(undefined);
        }}
        hasError={Boolean(errorText)}
        onSubmit={international ? handleContinue : undefined}
      />
      {errorText ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="auth-error">
          {errorText}
        </Text>
      ) : null}
      <AuthButton variant="emerald" label="Continue" onPress={handleContinue} loading={pending} disabled={!international} testID="send-otp" />
      <SignInDivider surface="sheet" />
      <SignInMethodRow surface="sheet" />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  label: { ...BRAND_TYPE.button, fontSize: 15, color: SHEET.ink },
  error: { ...BRAND_TYPE.fine, fontSize: 14, color: '#B42318' },
});
