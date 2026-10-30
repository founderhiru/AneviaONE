import React from 'react';
import { Text } from 'react-native';

import { Card, ScreenContainer, ScreenHeader } from '../../components';
import { BRAND } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { withProduct } from '../../../shared/faq';
import { TERMS_INTRO, TERMS_SECTIONS, TERMS_UPDATED } from '../../../shared/terms';

/**
 * Me → Terms of Service. The words live in shared/terms.ts, which the website's
 * /terms page also uses, so the app and the site always say the same thing.
 */
export default function TermsScreen() {
  const theme = useTheme();
  const name = BRAND.productName;
  return (
    <ScreenContainer>
      <ScreenHeader title="Terms of Service" />
      <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Last updated {TERMS_UPDATED}</Text>
      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>{withProduct(TERMS_INTRO, name)}</Text>
      {TERMS_SECTIONS.map((section) => (
        <Card key={section.title}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }]}>
            {withProduct(section.title, name)}
          </Text>
          {section.paragraphs.map((p) => (
            <Text
              key={p}
              style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }]}
            >
              {withProduct(p, name)}
            </Text>
          ))}
        </Card>
      ))}
    </ScreenContainer>
  );
}
