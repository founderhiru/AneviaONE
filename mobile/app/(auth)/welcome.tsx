import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, ScreenContainer, SecondaryButton } from '../../components';
import { BRAND } from '../../config/brand';
import { useTheme } from '../../design/theme';

export default function WelcomeScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.lg }}>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          {/* Text wordmark placeholder — no logo yet, per brand guidance */}
          <Text
            style={[theme.typography.displayMedium, { color: theme.colors.brandPrimary, textAlign: 'center' }]}
            accessibilityRole="header"
          >
            {BRAND.name}
          </Text>
          <Text style={[theme.typography.bodyLarge, { color: theme.colors.textSecondary, textAlign: 'center' }]}>
            {BRAND.tagline}
          </Text>
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label="Continue with Mobile"
          onPress={() => router.push('/(auth)/login?method=mobile')}
          testID="continue-with-mobile"
        />
        <SecondaryButton
          label="Continue with Google"
          onPress={() => router.push('/(auth)/login?method=google')}
          testID="continue-with-google"
        />
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, textAlign: 'center', marginTop: theme.spacing.xs }]}>
          By continuing, you agree that your health information belongs to you.
        </Text>
      </View>
    </ScreenContainer>
  );
}
