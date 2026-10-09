import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, ErrorState, IdentityFields, LoadingState, ScreenContainer, ScreenHeader } from '../../components';
import { useTheme } from '../../design/theme';
import { useIdentityForm } from '../../hooks/useIdentityForm';

/**
 * Identity details — full name and date of birth, entered by the person.
 * Used later to check that a health report belongs to them; entering them
 * doesn't verify any report by itself. Both are optional: leaving one empty
 * keeps it unset. Values are shown only here, never logged.
 */
export default function IdentityDetailsScreen() {
  const theme = useTheme();
  const form = useIdentityForm();

  return (
    <ScreenContainer>
      <ScreenHeader title="Identity details" />

      <Card>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.accent} style={{ marginTop: 2 }} />
          <Text style={[theme.typography.bodySmall, { flex: 1, color: theme.colors.textSecondary }]}>
            Your identity details help us verify that a health report belongs to you before adding it to Health Memory.
            They&rsquo;re private to you and are only compared with the name and date of birth printed on your reports.
          </Text>
        </View>
      </Card>

      {form.loadError ? (
        <ErrorState description={form.loadError} onRetry={form.reload} />
      ) : !form.loaded ? (
        <LoadingState label="Loading your details…" />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <IdentityFields form={form} namePlaceholder="As printed on your health reports" />

          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            You can leave either one empty for now. Adding them doesn&rsquo;t verify a report by itself.
          </Text>

          <Button label="Save" onPress={form.save} loading={form.saving} testID="identity-save" />

          {form.justSaved ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }} accessibilityLiveRegion="polite" testID="identity-saved">
              <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
              <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Saved.</Text>
            </View>
          ) : null}
          {form.saveError ? (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="identity-save-error">
              {form.saveError}
            </Text>
          ) : null}
        </View>
      )}
    </ScreenContainer>
  );
}
