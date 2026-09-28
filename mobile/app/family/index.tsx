import React from 'react';
import { Text } from 'react-native';

import { EmptyState, ScreenContainer, ScreenHeader } from '../../components';
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';

/** Route placeholder only — full family functionality is out of scope for
 * this MVP, per spec, but the route exists so the architecture supports it
 * later without restructuring navigation. */
export default function FamilyScreen() {
  const theme = useTheme();
  return (
    <ScreenContainer>
      <ScreenHeader title={PRODUCT_TERMS.familyHealth} />
      <EmptyState
        title="Coming soon"
        description="Manage health records for the people you care for, all in one place."
      />
      <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
        This is a placeholder screen.
      </Text>
    </ScreenContainer>
  );
}
