import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';
import { Button } from './Button';

export type ErrorStateProps = {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  /** Distinguishes an offline state visually/semantically from a generic error. */
  variant?: 'error' | 'offline';
};

export function ErrorState({
  title,
  description,
  retryLabel = 'Try again',
  onRetry,
  variant = 'error',
}: ErrorStateProps) {
  const theme = useTheme();
  const resolvedTitle = title ?? (variant === 'offline' ? 'You’re offline' : 'Something went wrong');
  const resolvedDescription =
    description ??
    (variant === 'offline'
      ? "Check your connection. Anything you add will sync once you're back online."
      : 'Please try again. If this keeps happening, let us know from Me → Help.');

  return (
    <View
      style={[styles.container, { padding: theme.spacing.xl, gap: theme.spacing.sm }]}
      accessibilityRole="alert"
    >
      <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
        {resolvedTitle}
      </Text>
      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
        {resolvedDescription}
      </Text>
      {onRetry ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Button label={retryLabel} onPress={onRetry} fullWidth={false} variant="secondary" />
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
