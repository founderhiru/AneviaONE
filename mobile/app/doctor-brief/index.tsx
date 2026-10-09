import React from 'react';
import { Text } from 'react-native';

import { Button, Card, ScreenContainer, ScreenHeader, StatusBadge } from '../../components';
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';

/**
 * Route + skeleton only, per spec — not a primary MVP navigation item.
 * Generation is not implemented; this establishes the architecture so a
 * real summarizer can be wired in later without redesigning the screen.
 */
export default function DoctorBriefScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer>
      <ScreenHeader title={PRODUCT_TERMS.doctorBrief} />
      <StatusBadge label="Preview" tone="accent" />
      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
        A concise summary of your health history that you can review before sharing.
      </Text>
      <Card>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
          Generating a Doctor Brief from your Health Memory isn&rsquo;t available yet. It will appear here when it
          is.
        </Text>
      </Card>
      <Button label="Generate Doctor Brief" onPress={() => {}} disabled />
    </ScreenContainer>
  );
}
