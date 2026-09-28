import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';

export type LoadingStateProps = {
  label?: string;
  fullScreen?: boolean;
};

export function LoadingState({ label = 'Loading…', fullScreen = false }: LoadingStateProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.container, fullScreen && styles.fullScreen, { gap: theme.spacing.sm }]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator color={theme.colors.brandPrimary} />
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{label}</Text>
    </View>
  );
}

/** Simple animated placeholder block for skeleton loading rows. */
export function SkeletonBlock({ width = '100%', height = 16 }: { width?: number | string; height?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: width as any,
        height,
        backgroundColor: theme.colors.skeleton,
        borderRadius: theme.radius.xs,
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fullScreen: {
    flex: 1,
  },
});
