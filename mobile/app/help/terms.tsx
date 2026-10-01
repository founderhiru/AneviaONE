import React from 'react';
import { Text } from 'react-native';

import { Card, ScreenContainer, ScreenHeader } from '../../components';
import { BRAND } from '../../config/brand';
import { useTheme } from '../../design/theme';

/**
 * Me → Terms of Service. The Terms are still being drafted (the website's
 * /terms page says the same), so this states that plainly rather than showing
 * placeholder legal text.
 */
export default function TermsScreen() {
  const theme = useTheme();
  return (
    <ScreenContainer>
      <ScreenHeader title="Terms of Service" />
      <Card>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }]}>
          Not published yet
        </Text>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
          The Terms of Service are being finalized and will be published before {BRAND.productName} launches.
        </Text>
      </Card>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
        {BRAND.productName} is a consumer health-information product. It helps you organize and understand your own
        records; it does not diagnose, treat or replace professional medical advice.
      </Text>
    </ScreenContainer>
  );
}
