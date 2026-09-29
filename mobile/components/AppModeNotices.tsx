import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { BRAND } from '../config/brand';
import { useTheme } from '../design/theme';

/**
 * Shown instead of the app when a production build is missing its Supabase
 * configuration. The app deliberately refuses to run on mock data here —
 * this is a build/setup problem for the team, not something to hide.
 */
export function ConfigurationRequired({ message }: { message: string }) {
  const theme = useTheme();
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return (
    <View
      style={[styles.fill, { backgroundColor: theme.colors.background, padding: theme.spacing.lg, gap: theme.spacing.sm }]}
      accessibilityRole="alert"
    >
      <Text style={[theme.typography.headingMedium, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
        {BRAND.name} isn’t configured
      </Text>
      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary, textAlign: 'center' }]}>
        This build can’t connect to its secure backend, so it won’t start. No data has been used or stored.
      </Text>
      {__DEV__ ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary, textAlign: 'center' }]}>{message}</Text>
      ) : null}
    </View>
  );
}

/** Small persistent label so a demo build can never pass for the real app. */
export function DemoModeBadge() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.badge, { top: insets.top + 4 }]} accessibilityLabel="Demo mode: sample data, nothing is saved">
      <Text style={styles.badgeText}>DEMO · sample data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 900,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#B4791F',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
});
