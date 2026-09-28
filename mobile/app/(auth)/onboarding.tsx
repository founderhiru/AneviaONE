import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, ScreenContainer, SecondaryButton } from '../../components';
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';

const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const theme = useTheme();
  const { completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);

  function goHome() {
    completeOnboarding();
    router.replace('/(tabs)/home');
  }

  function goToAdd() {
    completeOnboarding();
    router.replace('/add');
  }

  return (
    <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
        {step === 0 && (
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
              Your health has a history.
            </Text>
            <Text style={[theme.typography.headingMedium, { color: theme.colors.textSecondary }]}>
              Now it has intelligence.
            </Text>
          </View>
        )}
        {step === 1 && (
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            Bring your health records together and we&rsquo;ll help you understand how your health has changed over
            time.
          </Text>
        )}
        {step === 2 && (
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            Your {PRODUCT_TERMS.healthMemory} brings together information from your reports, prescriptions and
            health records.
          </Text>
        )}
        {step === 3 && (
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
              Start with your first health record.
            </Text>
          </View>
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: theme.spacing.sm }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === step ? theme.colors.brandPrimary : theme.colors.border,
              }}
            />
          ))}
        </View>

        {step === 0 && (
          <>
            <Button label="Build My Health Memory" onPress={() => setStep(1)} testID="onboarding-build-memory" />
            <SecondaryButton label="Skip for now" onPress={goHome} testID="onboarding-skip" />
          </>
        )}
        {(step === 1 || step === 2) && <Button label="Continue" onPress={() => setStep(step + 1)} />}
        {step === 3 && (
          <>
            <Button label="Take a photo" onPress={goToAdd} testID="onboarding-camera" />
            <SecondaryButton label="Upload a document" onPress={goToAdd} testID="onboarding-upload" />
            <SecondaryButton label="Skip" onPress={goHome} testID="onboarding-skip-record" />
          </>
        )}
      </View>
    </ScreenContainer>
  );
}
