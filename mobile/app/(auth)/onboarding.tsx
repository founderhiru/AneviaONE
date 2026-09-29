import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button, Card, ScreenContainer, SecondaryButton } from '../../components';
import { PRODUCT_TERMS, taglineLines } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { whatsappService } from '../../services/whatsapp/whatsappService';

const TOTAL_STEPS = 5;
const [TAGLINE_HEADLINE, TAGLINE_SUBLINE] = taglineLines();

export default function OnboardingScreen() {
  const theme = useTheme();
  const { completeOnboarding, user } = useAuth();
  const [step, setStep] = useState(0);
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);

  function goHome() {
    completeOnboarding();
    router.replace('/(tabs)/home');
  }

  function goToAdd() {
    completeOnboarding();
    router.replace('/add');
  }

  async function handleConnectWhatsApp() {
    setConnectingWhatsApp(true);
    // Mock connect using the number already on the account — no real
    // WhatsApp Business API call here. The full standalone connect flow
    // (with its own number entry) lives at /whatsapp for later use.
    await whatsappService.connect(user?.mobileNumber ?? '9876543210');
    setConnectingWhatsApp(false);
    setStep(4);
  }

  return (
    <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
        {step === 0 && (
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
              {TAGLINE_HEADLINE}
            </Text>
            <Text style={[theme.typography.headingMedium, { color: theme.colors.textSecondary }]}>
              {TAGLINE_SUBLINE}
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
          <View style={{ gap: theme.spacing.md }}>
            <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
              Your health records can start here.
            </Text>
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
              Send reports, prescriptions and medical documents through WhatsApp. We&rsquo;ll organize them into your{' '}
              {PRODUCT_TERMS.healthMemory}.
            </Text>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Ionicons name="logo-whatsapp" size={28} color={theme.colors.success} />
                <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary, flex: 1 }]}>
                  WhatsApp is a capture channel — the app stays the private place for your full health history.
                </Text>
              </View>
            </Card>
          </View>
        )}
        {step === 4 && (
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
            <Button
              label="Connect WhatsApp"
              onPress={handleConnectWhatsApp}
              loading={connectingWhatsApp}
              testID="onboarding-connect-whatsapp"
            />
            <SecondaryButton label="Maybe later" onPress={() => setStep(4)} testID="onboarding-skip-whatsapp" />
          </>
        )}
        {step === 4 && (
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
