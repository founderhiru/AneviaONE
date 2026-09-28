import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

/** Small label carrying status meaning via text + subtle color, never color
 * alone (accessibility requirement). */
export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const theme = useTheme();
  const { bg, fg } = {
    neutral: { bg: theme.colors.surfaceAlt, fg: theme.colors.textSecondary },
    success: { bg: theme.colors.successSubtle, fg: theme.colors.success },
    warning: { bg: theme.colors.warningSubtle, fg: theme.colors.warning },
    danger: { bg: theme.colors.dangerSubtle, fg: theme.colors.danger },
    accent: { bg: theme.colors.accentSubtle, fg: theme.colors.accent },
  }[tone];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm },
      ]}
    >
      <Text style={[theme.typography.labelSmall, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
});
