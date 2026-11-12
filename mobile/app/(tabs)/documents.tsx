import React from 'react';
import { Text } from 'react-native';

import { ScreenContainer, ScreenHeader } from '../../components';
import { VAULT_ENABLED } from '../../config/vaultFlag';
import { useTheme } from '../../design/theme';
import VaultScreen from '../vault/index';

/**
 * The Documents tab (new navigation only): Personal Documents, the same screen as /vault.
 * If the personal documents folder is not switched on for this build, it says so plainly.
 */
export default function DocumentsTab() {
  const theme = useTheme();
  if (!VAULT_ENABLED) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Personal Documents" />
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]} testID="documents-off">
          Personal Documents is not switched on yet. It will appear here soon.
        </Text>
      </ScreenContainer>
    );
  }
  return <VaultScreen />;
}
