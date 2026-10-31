import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '../../design/theme';
import { usePeople } from '../../hooks/usePeople';
import { isOwnRecord, type Person } from '../../services/people/peopleService';
import { BottomSheet } from '../BottomSheet';

const label = (p: Person) => (p.relationship === 'self' && p.access === 'owner' ? 'Me' : p.name);

/**
 * Shown only when the account has more than one person. Says whose records are
 * on screen and lets the person switch. While someone else's records are shown a
 * clear banner says so, so a relative's results are never mistaken for your own.
 */
export function PersonBar() {
  const theme = useTheme();
  const { people, active, switchTo } = usePeople();
  const [open, setOpen] = useState(false);
  if (people.length <= 1 || !active) return null;

  const mine = people.find((p) => isOwnRecord(p)) ?? null;
  const other = !isOwnRecord(active);

  return (
    <View style={{ gap: theme.spacing.xs }} testID="person-bar">
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Showing records of ${label(active)}. Change person`}
        testID="person-switch"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 }}
      >
        <Ionicons name="people-outline" size={18} color={theme.colors.brandPrimary} />
        <Text style={[theme.typography.labelMedium, { color: theme.colors.brandPrimary }]}>{label(active)}</Text>
        <Ionicons name="chevron-down" size={14} color={theme.colors.brandPrimary} />
      </Pressable>

      {other ? (
        <View
          testID="person-banner"
          style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.warning, borderWidth: 1, borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 4 }}
        >
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textPrimary, fontWeight: '600' }]}>
            Viewing {active.name}’s records{active.access === 'viewer' ? ' (view only)' : ''}
          </Text>
          {mine ? (
            <Pressable onPress={() => switchTo(mine.id)} accessibilityRole="button" testID="person-back">
              <Text style={[theme.typography.caption, { color: theme.colors.brandPrimary, fontWeight: '600' }]}>Back to my records</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Whose records?">
        <View style={{ gap: theme.spacing.xs }}>
          {people.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                switchTo(p.id);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: p.id === active.id }}
              testID={`person-option-${p.id}`}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing.sm }}
            >
              <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary, fontWeight: p.id === active.id ? '700' : '400' }]}>
                {label(p)}
                {p.access !== 'owner' ? ` · shared with you${p.access === 'viewer' ? ' (view only)' : ''}` : ''}
              </Text>
              {p.id === active.id ? <Ionicons name="checkmark" size={18} color={theme.colors.brandPrimary} /> : null}
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              setOpen(false);
              router.push('/family');
            }}
            accessibilityRole="link"
            testID="person-manage"
            style={{ paddingVertical: theme.spacing.sm }}
          >
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.brandPrimary, fontWeight: '600' }]}>Manage family</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}
