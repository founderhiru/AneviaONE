import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';
import type { HealthEvent } from '../types';

export type TimelineEventProps = {
  event: HealthEvent;
  onPress?: () => void;
  isLast?: boolean;
};

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short' });
}

export function TimelineEvent({ event, onPress, isLast }: TimelineEventProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${event.date}${event.summary ? `, ${event.summary}` : ''}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={styles.rail}>
        <Text style={[theme.typography.labelSmall, { color: theme.colors.textTertiary }]}>{formatMonth(event.date)}</Text>
        <View style={[styles.dot, { backgroundColor: theme.colors.brandPrimary }]} />
        {!isLast ? <View style={[styles.line, { backgroundColor: theme.colors.border }]} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: theme.spacing.lg, gap: 2 }}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{event.title}</Text>
        {event.summary ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{event.summary}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    minHeight: 44,
  },
  rail: {
    width: 44,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    marginBottom: 4,
  },
  line: {
    width: 2,
    flex: 1,
  },
});
