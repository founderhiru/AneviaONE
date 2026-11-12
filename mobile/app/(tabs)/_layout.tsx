import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AddSheet } from '../../components/nav/AddSheet';
import { NAV_V2 } from '../../config/navFlag';
import { useTheme } from '../../design/theme';
import { peopleService } from '../../services/people/peopleService';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  timeline: 'time',
  health: 'pulse',
  doctor: 'medkit',
  me: 'person-circle',
  hub: 'pulse',
  documents: 'folder-open',
};

/** Primary navigation: exactly five bottom tabs, per the fixed nav spec — do not add more here.
 * Today: Home / Timeline / Health / For Doctor / Me.
 * With EXPO_PUBLIC_NAV_V2=on: Home / Health / Add / Documents / Me (Timeline and For Doctor
 * live inside Health; their old routes still work, only hidden from the bar). */
export default function TabsLayout() {
  const theme = useTheme();
  const [addOpen, setAddOpen] = useState(false);
  const centre = NAV_V2 ? 'add' : 'doctor';

  // Who is on this account (yourself, relatives, people who shared theirs).
  useEffect(() => {
    peopleService.refresh().catch(() => undefined);
  }, []);

  return (
    <>
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
            route.name === centre ? (
              // Raised red badge with a white plus: the Add button (or, today, the Doctor hand-over).
              <View
                testID={NAV_V2 ? 'add-tab-badge' : 'doctor-tab-badge'}
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
        <Tabs.Screen name="timeline" options={NAV_V2 ? { href: null } : { title: 'Timeline' }} />
        <Tabs.Screen name="health" options={NAV_V2 ? { href: null } : { title: 'Health' }} />
        <Tabs.Screen name="doctor" options={NAV_V2 ? { href: null } : { title: 'For Doctor' }} />
        <Tabs.Screen name="hub" options={NAV_V2 ? { title: 'Health' } : { href: null }} />
        <Tabs.Screen
          name="add"
          options={NAV_V2 ? { title: 'Add' } : { href: null }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setAddOpen(true);
            },
          }}
        />
        <Tabs.Screen name="documents" options={NAV_V2 ? { title: 'Documents' } : { href: null }} />
        <Tabs.Screen name="me" options={{ title: 'Me' }} />
      </Tabs>
      {NAV_V2 ? <AddSheet visible={addOpen} onClose={() => setAddOpen(false)} /> : null}
    </>
  );
}
