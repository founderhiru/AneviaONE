import React, { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, ErrorState, IdentityFields, LoadingState, ScreenContainer, SecondaryButton } from '../../components';
import { BRAND } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { useIdentityForm } from '../../hooks/useIdentityForm';

/**
 * "Set up your health profile" — shown once, right after the first sign-in,
 * before any health record is added. Entirely optional: Continue saves
 * whatever was entered (a name, a date of birth, both or neither) through
 * the same identity service as Identity details; Skip saves nothing. Either
 * way the step is marked done and the root navigator moves on — this screen
 * never navigates itself, so there is one place that decides where a
 * signed-in person goes (app/_layout.tsx).
 */
export default function HealthProfileSetupScreen() {
  const theme = useTheme();
  const { markOnboardingFlags } = useAuth();
  const form = useIdentityForm();
  const { saved } = form;

  const finish = () => markOnboardingFlags({ identityOnboardingComplete: true });

  // Already has both details (added from Me before this step existed):
  // nothing to ask — move straight on.
  const alreadyComplete = Boolean(saved?.fullName && saved?.dateOfBirth);
  useEffect(() => {
    if (alreadyComplete) markOnboardingFlags({ identityOnboardingComplete: true });
  }, [alreadyComplete, markOnboardingFlags]);

  async function handleContinue() {
    // Nothing entered is the same as skipping: no values are written.
    if (form.isEmpty) return finish();
    if (await form.save()) finish();
  }

  const showForm = form.loaded && !alreadyComplete;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenContainer contentStyle={{ justifyContent: 'center' }}>
        <View style={{ gap: theme.spacing.sm }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Ionicons name="person-outline" size={24} color={theme.colors.brandPrimary} />
          </View>
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            Set up your health profile
          </Text>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
            Add a few details to help {BRAND.productName} recognize your health records accurately.
          </Text>
        </View>

        {form.loadError ? (
          <ErrorState description={form.loadError} onRetry={form.reload} />
        ) : !showForm ? (
          <LoadingState label="Loading your details…" />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            <IdentityFields form={form} nameHint="As it appears on your health records" />
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
              These details help us determine whether a health record belongs to you.
            </Text>
            {form.saveError ? (
              <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="setup-save-error">
                {form.saveError}
              </Text>
            ) : null}
          </View>
        )}

        <View style={{ gap: theme.spacing.sm }}>
          {showForm ? <Button label="Continue" onPress={handleContinue} loading={form.saving} testID="setup-continue" /> : null}
          <SecondaryButton label="Skip for now" onPress={finish} disabled={form.saving} testID="setup-skip" />
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
            You can add these details later in your profile.
          </Text>
        </View>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}
