import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '../design/theme';

export type ScreenHeaderProps = {
  title: string;
  onBack?: () => void;
  rightLabel?: string;
  onRightPress?: () => void;
};

/** Lightweight header used on stacked (non-tab) screens since the root
 * navigator renders with `headerShown: false` so every screen can control
 * its own header content. Uses the platform-appropriate back affordance
 * (chevron on iOS, arrow on Android) and respects Android hardware back via
 * `router.back()` already being the default gesture handler. */

/** Back, or Home when there is nothing to go back to (e.g. the screen was
 * opened by a deep link) — `router.back()` alone would do nothing. */
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/home');
}

export function ScreenHeader({ title, onBack, rightLabel, onRightPress }: ScreenHeaderProps) {
  const theme = useTheme();
  const backIcon = Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back';

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack ?? goBackOrHome}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={{ minWidth: theme.minTouchTarget, minHeight: theme.minTouchTarget, justifyContent: 'center' }}
      >
        <Ionicons name={backIcon} size={24} color={theme.colors.textPrimary} />
      </Pressable>
      <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary, flex: 1 }]} accessibilityRole="header">
        {title}
      </Text>
      {rightLabel ? (
        <Pressable
          onPress={onRightPress}
          accessibilityRole="button"
          style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
        >
          <Text style={[theme.typography.labelMedium, { color: theme.colors.brandPrimary }]}>{rightLabel}</Text>
        </Pressable>
      ) : (
        <View style={{ width: theme.minTouchTarget }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
