import React from 'react';
import { Share, Text } from 'react-native';

import { Button, Card, ScreenContainer, ScreenHeader, SecondaryButton, StatusBadge } from '../../components';
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';

/**
 * Route + skeleton only, per spec — not a primary MVP navigation item.
 * Generation is not implemented; this establishes the architecture so a
 * real summarizer can be wired in later without redesigning the screen.
 */
export default function DoctorBriefScreen() {
  const theme = useTheme();

  async function handleShare() {
    await Share.share({ message: `${PRODUCT_TERMS.doctorBrief} — preview, generation coming soon.` });
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={PRODUCT_TERMS.doctorBrief} />
      <StatusBadge label="Preview" tone="accent" />
      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
        A concise summary of your health history that you can review before sharing.
      </Text>
      <Card>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
          This feature isn&rsquo;t built yet — it&rsquo;s a placeholder so the navigation and architecture are ready
          for it.
        </Text>
      </Card>
      <Button label="Generate Doctor Brief" onPress={() => {}} disabled />
      <SecondaryButton label="Share" onPress={handleShare} />
    </ScreenContainer>
  );
}
