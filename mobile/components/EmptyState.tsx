import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';
import { Button } from './Button';

export type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  icon?: React.ReactNode;
};

export function EmptyState({ title, description, actionLabel, onActionPress, icon }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { padding: theme.spacing.xl, gap: theme.spacing.sm }]}>
      {icon}
      <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
        {title}
      </Text>
      {description ? (
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onActionPress ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Button label={actionLabel} onPress={onActionPress} fullWidth={false} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
