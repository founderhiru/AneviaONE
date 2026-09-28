import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';

export type EvidenceLinkProps = {
  label?: string;
  onPress: () => void;
};

/** "View Evidence" affordance — links a claim back to its source document.
 * Kept as one consistent component so evidence is always presented the
 * same way, reinforcing that every claim is traceable. */
export function EvidenceLink({ label = 'View Evidence', onPress }: EvidenceLinkProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1, minHeight: theme.minTouchTarget }]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: theme.colors.accent },
        ]}
      />
      <Text style={[theme.typography.labelMedium, { color: theme.colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
