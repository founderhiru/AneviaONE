import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../design/theme';
import DoctorScreen from './doctor';
import HealthScreen from './health';
import TimelineScreen from './timeline';

type Section = 'overview' | 'timeline' | 'doctor';
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'doctor', label: 'Doctor Brief' },
];

/**
 * Health (new navigation only). Three sections that are today's real screens, unchanged:
 * Overview (Health), Timeline and Doctor Brief (For Doctor). The red "Prepare for Doctor"
 * button jumps to the Doctor Brief from anywhere in Health.
 */
export default function HealthHub() {
  const theme = useTheme();
  const [section, setSection] = useState<Section>('overview');
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: theme.colors.background }}>
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Pressable
              onPress={() => setSection('doctor')}
              accessibilityRole="button"
              accessibilityLabel="Prepare for Doctor"
              testID="hub-prepare-doctor"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: theme.spacing.sm, borderRadius: 999, backgroundColor: theme.colors.danger }}
            >
              <Ionicons name="medkit" size={16} color="#FFFFFF" />
              <Text style={[theme.typography.labelMedium, { color: '#FFFFFF' }]}>Prepare for Doctor</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 3 }}>
            {SECTIONS.map((o) => {
              const selected = o.key === section;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => setSection(o.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`hub-seg-${o.key}`}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: theme.radius.sm, backgroundColor: selected ? theme.colors.surface : 'transparent' }}
                >
                  <Text style={[theme.typography.labelMedium, { color: selected ? theme.colors.textPrimary : theme.colors.textTertiary }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
      <View style={{ flex: 1 }} testID={`hub-${section}`}>
        {section === 'overview' && <HealthScreen />}
        {section === 'timeline' && <TimelineScreen />}
        {section === 'doctor' && <DoctorScreen />}
      </View>
    </View>
  );
}
