import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useTheme } from '../../design/theme';
import { peopleService } from '../../services/people/peopleService';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  timeline: 'time',
  health: 'pulse',
  doctor: 'medkit',
  me: 'person-circle',
};

/** Primary navigation: exactly five bottom tabs, per the fixed nav spec —
 * do not add more here. */
export default function TabsLayout() {
  const theme = useTheme();

  // Who is on this account (yourself, relatives, people who shared theirs).
  useEffect(() => {
    peopleService.refresh().catch(() => undefined);
  }, []);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brandPrimary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: theme.typography.labelSmall,
        tabBarIcon: ({ color, size }) =>
          route.name === 'doctor' ? (
            // Raised red badge with a white plus, so the Doctor hand-over is easy to find.
            <View
              testID="doctor-tab-badge"
              style={{
                width: 40,
                height: 40,
                borderRadius: 13,
                marginTop: -10,
                backgroundColor: theme.colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.2,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              }}
            >
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </View>
          ) : (
            <Ionicons name={ICONS[route.name] ?? 'ellipse'} size={size} color={color} />
          ),
      })}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="timeline" options={{ title: 'Timeline' }} />
      <Tabs.Screen name="health" options={{ title: 'Health' }} />
      <Tabs.Screen name="doctor" options={{ title: 'For Doctor' }} />
      <Tabs.Screen name="me" options={{ title: 'Me' }} />
    </Tabs>
  );
}
